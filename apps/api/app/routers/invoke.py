"""Invoke routes: /api/u/{handle}/caps, /api/u/{handle}/invoke."""

from __future__ import annotations

import time
from fastapi import APIRouter, HTTPException, Request

from ..db import get_supabase, has_nonce, add_nonce
from ..crypto import verify_signature
from ..policy import evaluate_policy
from ..capabilities.dispatcher import handle_capability
from ..seed import ensure_seed

router = APIRouter(prefix="/api/u", tags=["invoke"])

FIVE_MINUTES_MS = 5 * 60 * 1000


@router.get("/{handle}/caps")
async def get_caps(handle: str):
    db = get_supabase()
    res = db.table("humans").select("handle, capabilities(name, description), policies(capability_name, required_scopes_json, payment_required, price_cents)").eq("handle", handle).single().execute()

    if not res.data:
        raise HTTPException(status_code=404, detail="not_found")

    d = res.data
    return {
        "handle": d["handle"],
        "capabilities": [{"name": c["name"], "description": c["description"]} for c in d.get("capabilities", [])],
        "policies": [
            {
                "capabilityName": p["capability_name"],
                "requiredScopes": p["required_scopes_json"],
                "paymentRequired": p["payment_required"],
                "priceCents": p["price_cents"],
            }
            for p in d.get("policies", [])
        ],
    }


@router.post("/{handle}/invoke")
async def invoke(handle: str, request: Request):
    await ensure_seed()

    callee_handle = handle
    caller_handle = request.headers.get("x-caller-handle")
    signature = request.headers.get("x-signature")

    if not caller_handle or not signature:
        raise HTTPException(status_code=400, detail="X-Caller-Handle and X-Signature required")

    body = await request.json()

    # Validate required fields
    for field in ["capability", "scopes", "nonce", "timestamp"]:
        if field not in body:
            raise HTTPException(status_code=400, detail=f"missing field: {field}")

    db = get_supabase()

    # Lookup callee
    callee_res = db.table("humans").select("id, handle, public_key").eq("handle", callee_handle).single().execute()
    if not callee_res.data:
        raise HTTPException(status_code=404, detail="callee_not_found")

    # Lookup caller
    caller_res = db.table("humans").select("id, handle, public_key").eq("handle", caller_handle).single().execute()
    if not caller_res.data:
        raise HTTPException(status_code=404, detail="caller_not_found")

    # Verify signature
    sig_payload = {
        "capability": body["capability"],
        "scopes": body["scopes"],
        "input": body.get("input"),
        "nonce": body["nonce"],
        "timestamp": body["timestamp"],
    }

    verified = verify_signature(sig_payload, signature, caller_res.data["public_key"])
    if not verified:
        raise HTTPException(status_code=401, detail="signature_invalid")

    # Reject stale timestamp
    now_ms = int(time.time() * 1000)
    if now_ms - body["timestamp"] > FIVE_MINUTES_MS:
        raise HTTPException(status_code=401, detail="timestamp_expired")

    # Reject reused nonce
    if has_nonce(caller_handle, body["nonce"]):
        raise HTTPException(status_code=401, detail="nonce_reused")
    add_nonce(caller_handle, body["nonce"])

    # Evaluate policy
    policy_result = await evaluate_policy(
        callee_handle, caller_handle, body["capability"], body["scopes"]
    )

    if not policy_result.allowed:
        if policy_result.payment_required:
            return {
                "error": "payment_required",
                "checkoutUrl": policy_result.checkout_url,
                "priceCents": policy_result.price_cents,
            }
        raise HTTPException(status_code=403, detail=policy_result.reason or "policy_denied")

    # Route to capability handler
    result = await handle_capability(callee_handle, body["capability"], body.get("input"))

    return {"verified": True, **result}
