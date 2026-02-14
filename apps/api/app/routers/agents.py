"""Agent routes: /api/agents, /api/agents/{handle}/config."""

from __future__ import annotations

import json
from fastapi import APIRouter, HTTPException, Depends, Body

from ..deps import get_clerk_user_id
from ..db import get_supabase, set_private_key
from ..crypto import to_hex, keypair_from_seed
from ..seed import ensure_seed

router = APIRouter(prefix="/api/agents", tags=["agents"])


@router.get("")
async def list_agents(user_id: str = Depends(get_clerk_user_id)):
    await ensure_seed()
    db = get_supabase()

    # User's agents
    res = db.table("humans").select("*, capabilities(*), policies(*)").eq("clerk_user_id", user_id).execute()
    agents = res.data or []

    # Unclaimed demo agents
    unclaimed_res = (
        db.table("humans")
        .select("handle, display_name")
        .is_("clerk_user_id", "null")
        .execute()
    )
    unclaimed = [{"handle": u["handle"], "displayName": u["display_name"]} for u in (unclaimed_res.data or [])]

    return {"agents": agents, "unclaimed": unclaimed}


@router.post("")
async def create_agent(
    body: dict = Body(...),
    user_id: str = Depends(get_clerk_user_id),
):
    await ensure_seed()
    db = get_supabase()

    handle = body.get("handle", "").strip()
    display_name = body.get("displayName", handle)
    claim = body.get("claim", False)

    if not handle:
        raise HTTPException(status_code=400, detail="handle_required")

    # Check if handle exists
    existing = db.table("humans").select("id, clerk_user_id").eq("handle", handle).execute()

    if claim and existing.data:
        # Claim existing unclaimed agent
        agent = existing.data[0]
        if agent.get("clerk_user_id"):
            raise HTTPException(status_code=409, detail="already_claimed")

        db.table("humans").update({"clerk_user_id": user_id}).eq("id", agent["id"]).execute()

        # Regenerate keys
        seed_bytes = handle.encode("utf-8").ljust(32, b"\x00")[:32]
        pk, sk = keypair_from_seed(seed_bytes)
        set_private_key(handle, sk)

        return {"ok": True, "handle": handle}

    if existing.data:
        raise HTTPException(status_code=409, detail="handle_taken")

    # Create new agent with Ed25519 keypair
    seed_bytes = handle.encode("utf-8").ljust(32, b"\x00")[:32]
    pk, sk = keypair_from_seed(seed_bytes)
    set_private_key(handle, sk)

    from ..config import get_settings
    base_url = get_settings().base_url

    db.table("humans").insert({
        "handle": handle,
        "display_name": display_name,
        "public_key": to_hex(pk),
        "endpoint_url": f"{base_url}/api/u/{handle}",
        "clerk_user_id": user_id,
    }).execute()

    return {"ok": True, "handle": handle}


@router.get("/{handle}/config")
async def get_config(handle: str, user_id: str = Depends(get_clerk_user_id)):
    db = get_supabase()
    res = (
        db.table("humans")
        .select("*, capabilities(*), policies(*)")
        .eq("handle", handle)
        .eq("clerk_user_id", user_id)
        .execute()
    )

    if not res.data:
        raise HTTPException(status_code=404, detail="not_found")

    return res.data[0]


@router.put("/{handle}/config")
async def update_config(
    handle: str,
    body: dict = Body(...),
    user_id: str = Depends(get_clerk_user_id),
):
    db = get_supabase()

    # Verify ownership
    res = db.table("humans").select("id").eq("handle", handle).eq("clerk_user_id", user_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="not_found")

    agent_id = res.data[0]["id"]

    # Update human fields
    updates: dict = {}
    for field_map in [
        ("displayName", "display_name"),
        ("llmProvider", "llm_provider"),
        ("personaPrompt", "persona_prompt"),
        ("heygenAvatarId", "heygen_avatar_id"),
        ("avatarPhotoUrl", "avatar_photo_url"),
    ]:
        if field_map[0] in body:
            updates[field_map[1]] = body[field_map[0]]

    if "anomalyThresholds" in body:
        updates["anomaly_threshold_json"] = json.dumps(body["anomalyThresholds"])

    if updates:
        db.table("humans").update(updates).eq("id", agent_id).execute()

    # Update capabilities
    if "capabilities" in body:
        db.table("capabilities").delete().eq("human_id", agent_id).execute()
        caps = body["capabilities"]
        if caps:
            db.table("capabilities").insert([
                {
                    "human_id": agent_id,
                    "name": c.get("name", ""),
                    "description": c.get("description", ""),
                    "input_schema_json": c.get("inputSchemaJson", "{}"),
                    "output_schema_json": c.get("outputSchemaJson", "{}"),
                }
                for c in caps
            ]).execute()

    # Update policies
    if "policies" in body:
        for p in body["policies"]:
            cap_name = p.get("capabilityName", "")
            existing = (
                db.table("policies")
                .select("id")
                .eq("human_id", agent_id)
                .eq("capability_name", cap_name)
                .execute()
            )

            policy_data = {
                "human_id": agent_id,
                "capability_name": cap_name,
                "allowed_callers_json": json.dumps(p.get("allowedCallers", ["*"])),
                "required_scopes_json": json.dumps(p.get("requiredScopes", [])),
                "payment_required": p.get("paymentRequired", False),
                "price_cents": p.get("priceCents", 0),
            }

            if existing.data:
                db.table("policies").update(policy_data).eq("id", existing.data[0]["id"]).execute()
            else:
                db.table("policies").insert(policy_data).execute()

    return {"ok": True}
