"""Google OAuth routes: /api/google/connect, /api/google/callback."""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, HTTPException, Depends, Query, Request
from fastapi.responses import RedirectResponse

from ..deps import get_clerk_user_id
from ..db import get_supabase
from ..config import get_settings

router = APIRouter(prefix="/api/google", tags=["google"])

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"


@router.get("/connect")
async def connect(
    handle: str = Query(...),
    user_id: str = Depends(get_clerk_user_id),
):
    settings = get_settings()
    db = get_supabase()

    # Verify ownership
    agent = db.table("humans").select("id").eq("handle", handle).eq("clerk_user_id", user_id).single().execute()
    if not agent.data:
        raise HTTPException(status_code=404, detail="not_found")

    if not settings.google_client_id:
        raise HTTPException(status_code=500, detail="GOOGLE_CLIENT_ID not configured")

    # Build state token (handle + HMAC for CSRF protection)
    secret = settings.clerk_secret_key or "dev-secret"
    mac = hmac.new(secret.encode(), handle.encode(), hashlib.sha256).hexdigest()[:16]
    state = f"{handle}:{mac}"

    params = urlencode({
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events",
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    })

    return RedirectResponse(f"{GOOGLE_AUTH_URL}?{params}")


@router.get("/callback")
async def callback(
    code: str = Query(...),
    state: str = Query(...),
):
    settings = get_settings()

    # Validate state
    parts = state.split(":", 1)
    if len(parts) != 2:
        raise HTTPException(status_code=400, detail="invalid_state")

    handle, mac_received = parts
    secret = settings.clerk_secret_key or "dev-secret"
    mac_expected = hmac.new(secret.encode(), handle.encode(), hashlib.sha256).hexdigest()[:16]

    if not hmac.compare_digest(mac_received, mac_expected):
        raise HTTPException(status_code=400, detail="invalid_state_hmac")

    # Exchange code for tokens
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": settings.google_redirect_uri,
                "grant_type": "authorization_code",
            },
        )

    if not resp.is_success:
        raise HTTPException(status_code=500, detail="token_exchange_failed")

    token_data = resp.json()
    tokens = {
        "access_token": token_data["access_token"],
        "refresh_token": token_data.get("refresh_token", ""),
        "expiry": time.time() * 1000 + token_data.get("expires_in", 3600) * 1000,
    }

    db = get_supabase()
    db.table("humans").update({"google_calendar_tokens": json.dumps(tokens)}).eq("handle", handle).execute()

    return RedirectResponse(f"{settings.frontend_url}/dashboard/agents/{handle}")
