"""Registry routes: /api/registry/lookup/{handle}, /api/registry/register."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..db import get_supabase
from ..models import RegisterBody

router = APIRouter(prefix="/api/registry", tags=["registry"])


@router.get("/lookup/{handle}")
async def lookup(handle: str):
    db = get_supabase()
    res = db.table("humans").select("handle, endpoint_url, public_key, display_name").eq("handle", handle).single().execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="not_found")

    d = res.data
    return {
        "handle": d["handle"],
        "endpointUrl": d["endpoint_url"],
        "publicKey": d["public_key"],
        "displayName": d["display_name"],
    }


@router.post("/register")
async def register(body: RegisterBody):
    db = get_supabase()
    db.table("humans").upsert({
        "handle": body.handle,
        "endpoint_url": body.endpoint_url,
        "public_key": body.public_key,
        "display_name": body.display_name,
    }, on_conflict="handle").execute()

    return {"ok": True}
