"""Health data routes: /api/health-data (iOS upload)."""

from __future__ import annotations

import asyncio
from fastapi import APIRouter, HTTPException

from ..db import get_supabase
from ..models import HealthDataPayload

router = APIRouter(prefix="/api/health-data", tags=["health-data"])


@router.post("")
async def upload_health_data(body: HealthDataPayload):
    db = get_supabase()
    device_id = body.device_id or "unknown"

    # Create upload record
    upload_res = (
        db.table("health_uploads")
        .insert({"device_id": device_id, "export_date": body.export_date})
        .execute()
    )

    if not upload_res.data:
        raise HTTPException(status_code=500, detail="Failed to create upload record")

    upload_id = upload_res.data[0]["id"]

    # Insert all health data
    failures = 0

    def _insert(table: str, rows: list[dict]) -> None:
        nonlocal failures
        if not rows:
            return
        try:
            db.table(table).insert(rows).execute()
        except Exception:
            failures += 1

    _insert("steps", [{"upload_id": upload_id, "date": s.date, "step_count": s.step_count} for s in body.steps])
    _insert("heart_rates", [{"upload_id": upload_id, "start_date": h.start_date, "end_date": h.end_date, "bpm": h.bpm} for h in body.heart_rates])
    _insert("sleep_samples", [{"upload_id": upload_id, "start_date": s.start_date, "end_date": s.end_date, "sleep_stage": s.sleep_stage} for s in body.sleep_samples])
    _insert("active_energy", [{"upload_id": upload_id, "date": a.date, "kilocalories": a.kilocalories} for a in body.active_energy])
    _insert("distances", [{"upload_id": upload_id, "date": d.date, "distance_meters": d.distance_meters} for d in body.distances])
    _insert("workouts", [{"upload_id": upload_id, "start_date": w.start_date, "end_date": w.end_date, "activity_type": w.activity_type, "duration_seconds": w.duration_seconds, "total_energy_kcal": w.total_energy_kcal, "total_distance_meters": w.total_distance_meters} for w in body.workouts])
    _insert("weights", [{"upload_id": upload_id, "date": w.date, "weight_kg": w.weight_kg} for w in body.weights])
    _insert("heights", [{"upload_id": upload_id, "date": h.date, "height_cm": h.height_cm} for h in body.heights])
    _insert("health_events", [{"upload_id": upload_id, "event_type": e.event_type, "start_date": e.start_date, "end_date": e.end_date} for e in body.health_events])

    if failures > 0:
        return {"uploadId": upload_id, "warning": f"{failures} table insert(s) had errors"}

    return {"uploadId": upload_id, "status": "ok"}
