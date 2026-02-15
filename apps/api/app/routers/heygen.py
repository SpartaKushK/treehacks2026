"""HeyGen routes: /api/heygen/avatars, /api/heygen/token."""

from __future__ import annotations

import re
import time

import httpx
from fastapi import APIRouter, HTTPException, Depends

from ..deps import get_clerk_user_id
from ..config import get_settings

router = APIRouter(prefix="/api/heygen", tags=["heygen"])

HEYGEN_API_BASE = "https://api.heygen.com"

# In-memory cache
_cached_avatars: list[dict] | None = None
_cache_timestamp: float = 0
CACHE_TTL = 10 * 60  # 10 minutes


@router.get("/avatars")
async def list_avatars(user_id: str = Depends(get_clerk_user_id)):
    global _cached_avatars, _cache_timestamp

    settings = get_settings()
    if not settings.heygen_api_key:
        return {"avatars": []}

    if _cached_avatars is not None and time.time() - _cache_timestamp < CACHE_TTL:
        return {"avatars": _cached_avatars}

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{HEYGEN_API_BASE}/v2/avatars",
            headers={"X-Api-Key": settings.heygen_api_key, "Content-Type": "application/json"},
            timeout=30,
        )

    if not resp.is_success:
        return {"avatars": _cached_avatars or []}

    data = resp.json()
    all_avatars = data.get("data", {}).get("avatars", [])

    _cached_avatars = [
        {
            "avatar_id": a["avatar_id"],
            "avatar_name": a.get("avatar_name", "Unnamed"),
            "preview_image_url": a.get("preview_image_url", ""),
            "gender": a.get("gender"),
            "isCustom": bool(re.match(r"^[0-9a-f]{32}$", a["avatar_id"], re.IGNORECASE)),
        }
        for a in all_avatars
        if a.get("preview_image_url")
    ]
    _cache_timestamp = time.time()

    return {"avatars": _cached_avatars}


@router.post("/token")
async def create_token(user_id: str = Depends(get_clerk_user_id)):
    settings = get_settings()
    if not settings.heygen_api_key:
        raise HTTPException(status_code=500, detail="failed_to_create_token")

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{HEYGEN_API_BASE}/v1/streaming.create_token",
            headers={"X-Api-Key": settings.heygen_api_key, "Content-Type": "application/json"},
            json={},
            timeout=30,
        )

    if not resp.is_success:
        raise HTTPException(status_code=500, detail="failed_to_create_token")

    data = resp.json()
    token = data.get("data", {}).get("token")
    if not token:
        raise HTTPException(status_code=500, detail="failed_to_create_token")

    return {"token": token}
