"""Calendar routes: /api/calendar/events, /api/calendar/sync."""

from __future__ import annotations

import json
from datetime import datetime, timedelta

import httpx
from fastapi import APIRouter, HTTPException, Depends, Query

from ..deps import get_clerk_user_id
from ..db import get_supabase
from ..config import get_settings

router = APIRouter(prefix="/api/calendar", tags=["calendar"])

GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3"


async def _get_tokens(human_id: str) -> dict | None:
    """Get and refresh Google Calendar tokens."""
    db = get_supabase()
    res = db.table("humans").select("google_calendar_tokens").eq("id", human_id).single().execute()
    if not res.data or not res.data.get("google_calendar_tokens"):
        return None

    tokens = json.loads(res.data["google_calendar_tokens"])
    settings = get_settings()

    # Refresh if expired (5min buffer)
    import time
    if time.time() * 1000 > tokens["expiry"] - 300_000:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                GOOGLE_TOKEN_URL,
                data={
                    "client_id": settings.google_client_id,
                    "client_secret": settings.google_client_secret,
                    "refresh_token": tokens["refresh_token"],
                    "grant_type": "refresh_token",
                },
            )
            if not resp.is_success:
                return None
            data = resp.json()
            tokens["access_token"] = data["access_token"]
            tokens["expiry"] = time.time() * 1000 + data["expires_in"] * 1000
            db.table("humans").update({"google_calendar_tokens": json.dumps(tokens)}).eq("id", human_id).execute()

    return tokens


async def _sync_calendar(human_id: str) -> None:
    """Pull Google events into local calendar_events."""
    now = datetime.now()
    future = now + timedelta(days=30)

    tokens = await _get_tokens(human_id)
    if not tokens:
        return

    async with httpx.AsyncClient() as client:
        params = {
            "timeMin": now.isoformat() + "Z",
            "timeMax": future.isoformat() + "Z",
            "singleEvents": "true",
            "orderBy": "startTime",
            "maxResults": "50",
        }
        resp = await client.get(
            f"{GOOGLE_CALENDAR_API}/calendars/primary/events",
            params=params,
            headers={"Authorization": f"Bearer {tokens['access_token']}"},
        )
        if not resp.is_success:
            return
        data = resp.json()

    db = get_supabase()
    for item in data.get("items", []):
        ge_id = item.get("id")
        summary = item.get("summary", "Untitled")
        start = (item.get("start", {}).get("dateTime") or item.get("start", {}).get("date", ""))
        end = (item.get("end", {}).get("dateTime") or item.get("end", {}).get("date", ""))

        existing = db.table("calendar_events").select("id").eq("human_id", human_id).eq("google_event_id", ge_id).execute()

        if not existing.data:
            db.table("calendar_events").insert({
                "human_id": human_id,
                "title": summary,
                "start_ts": start,
                "end_ts": end,
                "google_event_id": ge_id,
                "source": "google",
            }).execute()
        else:
            db.table("calendar_events").update({
                "title": summary,
                "start_ts": start,
                "end_ts": end,
            }).eq("id", existing.data[0]["id"]).execute()


@router.get("/events")
async def get_events(
    handle: str = Query(...),
    user_id: str = Depends(get_clerk_user_id),
):
    db = get_supabase()
    agent = db.table("humans").select("id").eq("handle", handle).eq("clerk_user_id", user_id).single().execute()
    if not agent.data:
        raise HTTPException(status_code=404, detail="not_found")

    events = db.table("calendar_events").select("*").eq("human_id", agent.data["id"]).order("start_ts").execute()
    return {"events": events.data or []}


@router.post("/sync")
async def sync(
    body: dict,
    user_id: str = Depends(get_clerk_user_id),
):
    handle = body.get("handle", "")
    db = get_supabase()
    agent = db.table("humans").select("id").eq("handle", handle).eq("clerk_user_id", user_id).single().execute()
    if not agent.data:
        raise HTTPException(status_code=404, detail="not_found")

    await _sync_calendar(agent.data["id"])
    return {"ok": True}
