"""Auth routes: /api/auth/webhook (Clerk webhook handler)."""

from __future__ import annotations

from fastapi import APIRouter, Request

from ..db import get_supabase, set_private_key
from ..crypto import to_hex, keypair_from_seed

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/webhook")
async def webhook(request: Request):
    body = await request.json()

    event_type = body.get("type", "")
    if event_type != "user.created":
        return {"ok": True}

    data = body.get("data", {})
    user_id = data.get("id", "")

    # Generate handle from username or email
    handle = (
        data.get("username")
        or (data.get("email_addresses", [{}])[0].get("email_address", "").split("@")[0])
        or user_id[:8]
    )
    display_name = f"{data.get('first_name', '')} {data.get('last_name', '')}".strip() or handle

    db = get_supabase()

    # Check if handle exists (unclaimed)
    existing = db.table("humans").select("id, clerk_user_id").eq("handle", handle).execute()

    if existing.data and not existing.data[0].get("clerk_user_id"):
        # Claim existing unclaimed agent
        db.table("humans").update({"clerk_user_id": user_id}).eq("id", existing.data[0]["id"]).execute()

        seed_bytes = handle.encode("utf-8").ljust(32, b"\x00")[:32]
        _, sk = keypair_from_seed(seed_bytes)
        set_private_key(handle, sk)

        return {"ok": True, "handle": handle}

    # Create new agent
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
