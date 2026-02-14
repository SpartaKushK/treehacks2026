"""Scheduling capability handlers (ported from apps/web/lib/people.ts)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from ..db import get_supabase


def _find_free_slots(
    busy: list[dict],
    window_start: str,
    window_end: str,
    duration_mins: int,
) -> list[dict]:
    """Find free slots in a time window, respecting busy periods and business hours."""
    slots: list[dict] = []
    ws = datetime.fromisoformat(window_start.replace("Z", "+00:00")).timestamp() * 1000
    we = datetime.fromisoformat(window_end.replace("Z", "+00:00")).timestamp() * 1000
    dur = duration_mins * 60 * 1000

    sorted_busy = sorted(busy, key=lambda e: datetime.fromisoformat(e["start"].replace("Z", "+00:00")).timestamp())

    cursor = ws

    for event in sorted_busy:
        e_start = datetime.fromisoformat(event["start"].replace("Z", "+00:00")).timestamp() * 1000
        e_end = datetime.fromisoformat(event["end"].replace("Z", "+00:00")).timestamp() * 1000

        if e_start < cursor:
            cursor = max(cursor, e_end)
            continue

        while cursor + dur <= e_start and cursor + dur <= we:
            d = datetime.fromtimestamp(cursor / 1000)
            hour = d.hour
            if 9 <= hour < 18:
                slots.append({
                    "start": datetime.fromtimestamp(cursor / 1000).isoformat(),
                    "end": datetime.fromtimestamp((cursor + dur) / 1000).isoformat(),
                })
                if len(slots) >= 5:
                    return slots
            cursor += 30 * 60 * 1000

        cursor = max(cursor, e_end)

    while cursor + dur <= we:
        d = datetime.fromtimestamp(cursor / 1000)
        hour = d.hour
        if 9 <= hour < 18:
            slots.append({
                "start": datetime.fromtimestamp(cursor / 1000).isoformat(),
                "end": datetime.fromtimestamp((cursor + dur) / 1000).isoformat(),
            })
            if len(slots) >= 5:
                return slots
        cursor += 30 * 60 * 1000

    return slots


async def handle_schedule_propose(handle: str, input_data: Any) -> dict:
    db = get_supabase()

    res = db.table("humans").select("id").eq("handle", handle).single().execute()
    if not res.data:
        return {"ok": False, "data": {"error": "user_not_found"}}

    human_id = res.data["id"]

    events_res = db.table("calendar_events").select("start_ts, end_ts").eq("human_id", human_id).execute()
    events = events_res.data or []

    busy = [{"start": e["start_ts"], "end": e["end_ts"]} for e in events]

    inp = input_data if isinstance(input_data, dict) else {}
    free_slots = _find_free_slots(
        busy,
        inp.get("timeWindow", {}).get("start", ""),
        inp.get("timeWindow", {}).get("end", ""),
        inp.get("durationMins", 30),
    )

    return {
        "ok": True,
        "data": {
            "proposedSlots": free_slots[:3],
            "message": f"Found {len(free_slots)} available slot(s) for \"{inp.get('title', 'meeting')}\".",
        },
    }


async def handle_schedule_counter(handle: str, input_data: Any) -> dict:
    db = get_supabase()

    res = db.table("humans").select("id").eq("handle", handle).single().execute()
    if not res.data:
        return {"ok": False, "data": {"error": "user_not_found"}}

    human_id = res.data["id"]

    events_res = db.table("calendar_events").select("start_ts, end_ts").eq("human_id", human_id).execute()
    events = events_res.data or []

    inp = input_data if isinstance(input_data, dict) else {}
    proposed_slots = inp.get("proposedSlots", [])

    # Filter proposed slots against own calendar
    acceptable = []
    for slot in proposed_slots:
        conflict = False
        for e in events:
            if (
                datetime.fromisoformat(slot["start"].replace("Z", "+00:00"))
                < datetime.fromisoformat(e["end_ts"].replace("Z", "+00:00"))
                and datetime.fromisoformat(slot["end"].replace("Z", "+00:00"))
                > datetime.fromisoformat(e["start_ts"].replace("Z", "+00:00"))
            ):
                conflict = True
                break
        if not conflict:
            acceptable.append(slot)

    if acceptable:
        return {
            "ok": True,
            "data": {
                "proposedSlots": acceptable,
                "message": f"{len(acceptable)} of the proposed slots work for me.",
            },
        }

    # Counter with own free slots
    window = proposed_slots[0] if proposed_slots else None
    if not window:
        return {"ok": True, "data": {"proposedSlots": [], "message": "No slots available."}}

    busy = [{"start": e["start_ts"], "end": e["end_ts"]} for e in events]
    free_slots = _find_free_slots(
        busy,
        window["start"],
        window["end"],
        inp.get("durationMins", 30),
    )

    return {
        "ok": True,
        "data": {
            "proposedSlots": free_slots[:3],
            "message": "None of those work. How about these instead?",
        },
    }


async def handle_schedule_confirm(input_data: Any) -> dict:
    db = get_supabase()

    inp = input_data if isinstance(input_data, dict) else {}
    chosen_slot = inp.get("chosenSlot", {})
    participants = inp.get("participants", [])

    booking_id = str(uuid.uuid4())
    db.table("bookings").insert({
        "id": booking_id,
        "from_handle": participants[0] if participants else "unknown",
        "to_handle": participants[1] if len(participants) > 1 else "unknown",
        "start_ts": chosen_slot.get("start", ""),
        "end_ts": chosen_slot.get("end", ""),
        "title": inp.get("title", "Meeting"),
    }).execute()

    return {
        "ok": True,
        "data": {"bookingId": booking_id, "status": "confirmed"},
    }
