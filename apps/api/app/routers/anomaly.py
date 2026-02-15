"""Anomaly routes: /api/anomaly/live, /api/anomaly/history, /api/anomaly/{id}/dismiss|resolve."""

from __future__ import annotations

import json
from fastapi import APIRouter, HTTPException, Depends, Query

from ..deps import get_clerk_user_id
from ..db import get_supabase

router = APIRouter(prefix="/api/anomaly", tags=["anomaly"])


async def _get_user_agent_ids(user_id: str) -> tuple[list[str], dict]:
    """Get agent IDs and avatar map for the current user."""
    db = get_supabase()
    res = db.table("humans").select("id, handle, display_name, heygen_avatar_id").eq("clerk_user_id", user_id).execute()
    agents = res.data or []
    ids = [a["id"] for a in agents]
    avatar_map = {a["id"]: a.get("heygen_avatar_id") for a in agents}
    return ids, avatar_map


@router.get("/live")
async def live(
    user_id: str = Depends(get_clerk_user_id),
    severity: str | None = Query(default=None),
    status: str | None = Query(default=None),
    trace_id: str | None = Query(default=None, alias="traceId"),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=50),
):
    agent_ids, avatar_map = await _get_user_agent_ids(user_id)
    if not agent_ids:
        return {"alerts": [], "total": 0, "page": page, "limit": limit}

    db = get_supabase()

    query = db.table("anomaly_alerts").select("*", count="exact")
    query = query.in_("human_id", agent_ids)

    if severity:
        query = query.eq("severity", severity)
    if status:
        query = query.eq("status", status)
    if trace_id:
        query = query.eq("trace_id", trace_id)

    offset = (page - 1) * limit
    query = query.order("created_at", desc=True).range(offset, offset + limit - 1)

    res = query.execute()
    alerts = res.data or []
    total = res.count or 0

    # Attach avatar info
    for alert in alerts:
        alert["agentAvatarId"] = avatar_map.get(alert.get("human_id"))

    return {"alerts": alerts, "total": total, "page": page, "limit": limit}


@router.get("/history")
async def history(
    user_id: str = Depends(get_clerk_user_id),
    severity: str | None = Query(default=None),
    status: str | None = Query(default=None),
    trace_id: str | None = Query(default=None, alias="traceId"),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=50),
):
    # Same implementation as live
    return await live(user_id=user_id, severity=severity, status=status, trace_id=trace_id, page=page, limit=limit)


@router.post("/{alert_id}/dismiss")
async def dismiss(alert_id: str, user_id: str = Depends(get_clerk_user_id)):
    db = get_supabase()

    # Verify ownership
    alert_res = db.table("anomaly_alerts").select("human_id").eq("id", alert_id).single().execute()
    if not alert_res.data:
        raise HTTPException(status_code=404, detail="alert_not_found")

    agent_ids, _ = await _get_user_agent_ids(user_id)
    if alert_res.data["human_id"] not in agent_ids:
        raise HTTPException(status_code=403, detail="not_owner")

    db.table("anomaly_alerts").update({"status": "dismissed"}).eq("id", alert_id).execute()
    return {"ok": True}


@router.post("/{alert_id}/resolve")
async def resolve(alert_id: str, user_id: str = Depends(get_clerk_user_id)):
    db = get_supabase()

    alert_res = db.table("anomaly_alerts").select("human_id").eq("id", alert_id).single().execute()
    if not alert_res.data:
        raise HTTPException(status_code=404, detail="alert_not_found")

    agent_ids, _ = await _get_user_agent_ids(user_id)
    if alert_res.data["human_id"] not in agent_ids:
        raise HTTPException(status_code=403, detail="not_owner")

    from datetime import datetime, timezone
    db.table("anomaly_alerts").update({
        "status": "resolved",
        "resolved_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", alert_id).execute()

    return {"ok": True}
