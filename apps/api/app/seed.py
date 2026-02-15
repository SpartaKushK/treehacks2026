"""Database seeder (ported from apps/web/lib/seed.ts + ensureSeed.ts)."""

from __future__ import annotations

import json
import math
import random
from datetime import datetime, timedelta

from .db import get_supabase, set_private_key
from .crypto import to_hex, keypair_from_seed
from .config import get_settings

_seeded = False


async def ensure_seed() -> None:
    """Idempotent seed check. Safe to call on every request."""
    global _seeded
    if _seeded:
        return

    db = get_supabase()
    res = db.table("humans").select("id", count="exact").limit(1).execute()
    count = res.count or 0

    if count > 0:
        await _rehydrate_keys()
        _seeded = True
        return

    await seed()
    _seeded = True


async def _rehydrate_keys() -> None:
    """Regenerate deterministic keypairs from handles (demo only)."""
    db = get_supabase()
    res = db.table("humans").select("id, handle").execute()

    for h in (res.data or []):
        handle = h["handle"]
        seed_bytes = handle.encode("utf-8").ljust(32, b"\x00")[:32]
        pk, sk = keypair_from_seed(seed_bytes)
        set_private_key(handle, sk)

        # Update public key to match regenerated keypair
        db.table("humans").update({"public_key": to_hex(pk)}).eq("id", h["id"]).execute()


async def seed() -> None:
    """Full database seed with demo data."""
    db = get_supabase()

    # Clean existing data (order matters for FK constraints)
    for table in ["anomaly_alerts", "traces", "bookings", "health_metrics", "calendar_events", "policies", "capabilities", "humans"]:
        db.table(table).delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()

    # Generate deterministic keypairs
    pari_pk, pari_sk = keypair_from_seed("pari".encode().ljust(32, b"\x00")[:32])
    alex_pk, alex_sk = keypair_from_seed("alex".encode().ljust(32, b"\x00")[:32])
    dr_smith_pk, dr_smith_sk = keypair_from_seed("dr_smith".encode().ljust(32, b"\x00")[:32])

    set_private_key("pari", pari_sk)
    set_private_key("alex", alex_sk)
    set_private_key("dr_smith", dr_smith_sk)

    base_url = get_settings().base_url

    # Create humans
    pari = db.table("humans").insert({
        "handle": "pari",
        "display_name": "Pari",
        "public_key": to_hex(pari_pk),
        "endpoint_url": f"{base_url}/api/u/pari",
    }).execute().data[0]

    alex = db.table("humans").insert({
        "handle": "alex",
        "display_name": "Alex",
        "public_key": to_hex(alex_pk),
        "endpoint_url": f"{base_url}/api/u/alex",
    }).execute().data[0]

    dr_smith = db.table("humans").insert({
        "handle": "dr_smith",
        "display_name": "Dr. Smith",
        "public_key": to_hex(dr_smith_pk),
        "endpoint_url": f"{base_url}/api/u/dr_smith",
    }).execute().data[0]

    # Capabilities for alex
    db.table("capabilities").insert([
        {"human_id": alex["id"], "name": "schedule_propose", "description": "Propose meeting times"},
        {"human_id": alex["id"], "name": "schedule_counter", "description": "Counter-propose meeting times"},
        {"human_id": alex["id"], "name": "schedule_confirm", "description": "Confirm a meeting booking"},
        {"human_id": alex["id"], "name": "execute_trade", "description": "Execute a financial trade"},
    ]).execute()

    # Capabilities for pari
    db.table("capabilities").insert([
        {"human_id": pari["id"], "name": "schedule_propose", "description": "Propose meeting times"},
        {"human_id": pari["id"], "name": "schedule_confirm", "description": "Confirm a meeting booking"},
        {"human_id": pari["id"], "name": "health_summary", "description": "View health analytics summary"},
        {"human_id": pari["id"], "name": "health.anomaly_alert", "description": "Receive and triage a health anomaly alert from wearable data"},
    ]).execute()

    # Capabilities for dr_smith
    db.table("capabilities").insert([
        {"human_id": dr_smith["id"], "name": "triage.intake_and_schedule", "description": "Run intake questions and schedule a clinic appointment"},
    ]).execute()

    # Policies for alex
    db.table("policies").insert([
        {"human_id": alex["id"], "capability_name": "schedule_propose", "allowed_callers_json": json.dumps(["pari"]), "required_scopes_json": json.dumps([])},
        {"human_id": alex["id"], "capability_name": "schedule_counter", "allowed_callers_json": json.dumps(["pari"]), "required_scopes_json": json.dumps([])},
        {"human_id": alex["id"], "capability_name": "schedule_confirm", "allowed_callers_json": json.dumps(["pari"]), "required_scopes_json": json.dumps(["propose_meeting"])},
        {"human_id": alex["id"], "capability_name": "execute_trade", "allowed_callers_json": json.dumps([]), "required_scopes_json": json.dumps(["trade_exec"])},
    ]).execute()

    # Policies for pari
    db.table("policies").insert([
        {"human_id": pari["id"], "capability_name": "health_summary", "allowed_callers_json": json.dumps(["dr_smith"]), "required_scopes_json": json.dumps([]), "payment_required": True, "price_cents": 500},
        {"human_id": pari["id"], "capability_name": "schedule_propose", "allowed_callers_json": json.dumps(["*"]), "required_scopes_json": json.dumps([])},
        {"human_id": pari["id"], "capability_name": "schedule_confirm", "allowed_callers_json": json.dumps(["*"]), "required_scopes_json": json.dumps(["propose_meeting"])},
        {"human_id": pari["id"], "capability_name": "health.anomaly_alert", "allowed_callers_json": json.dumps(["pari"]), "required_scopes_json": json.dumps(["health:write"])},
    ]).execute()

    # Policies for dr_smith
    db.table("policies").insert([
        {"human_id": dr_smith["id"], "capability_name": "triage.intake_and_schedule", "allowed_callers_json": json.dumps(["pari"]), "required_scopes_json": json.dumps(["triage:write"])},
    ]).execute()

    # Alex's calendar: busy slots next week
    next_mon = _get_next_monday()
    db.table("calendar_events").insert([
        {"human_id": alex["id"], "title": "Team standup", "start_ts": _set_time(next_mon, 9, 0).isoformat(), "end_ts": _set_time(next_mon, 9, 30).isoformat()},
        {"human_id": alex["id"], "title": "Lunch with team", "start_ts": _set_time(next_mon, 12, 0).isoformat(), "end_ts": _set_time(next_mon, 13, 0).isoformat()},
        {"human_id": alex["id"], "title": "Design review", "start_ts": _set_time(next_mon + timedelta(days=1), 14, 0).isoformat(), "end_ts": _set_time(next_mon + timedelta(days=1), 15, 30).isoformat()},
        {"human_id": alex["id"], "title": "1:1 with manager", "start_ts": _set_time(next_mon + timedelta(days=2), 10, 0).isoformat(), "end_ts": _set_time(next_mon + timedelta(days=2), 10, 30).isoformat()},
    ]).execute()

    # Pari's health metrics for last 30 days
    today = datetime.now()
    health_data = []
    for i in range(29, -1, -1):
        date = today - timedelta(days=i)
        day_str = date.strftime("%Y-%m-%d")

        base_sleep = 6.5 + math.sin(i * 0.3) * 1.5
        base_steps = 7000 + math.sin(i * 0.5) * 3000
        adherence = random.random() > 0.15
        symptom = 3 + math.sin(i * 0.7) * 2 + (4 if i == 10 else 0)

        health_data.append({
            "human_id": pari["id"],
            "date": day_str,
            "sleep_hours": round(max(4, min(9, base_sleep)), 1),
            "steps": round(max(2000, base_steps)),
            "med_adherence": adherence,
            "symptom_score": round(max(1, min(10, symptom)), 1),
        })

    db.table("health_metrics").insert(health_data).execute()

    print("Seed complete: pari, alex, dr_smith created with demo data.")


def _get_next_monday() -> datetime:
    d = datetime.now()
    days_ahead = (7 - d.weekday()) % 7
    if days_ahead == 0:
        days_ahead = 7
    d = d + timedelta(days=days_ahead)
    return d.replace(hour=0, minute=0, second=0, microsecond=0)


def _set_time(d: datetime, h: int, m: int) -> datetime:
    return d.replace(hour=h, minute=m, second=0, microsecond=0)
