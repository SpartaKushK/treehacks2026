"""Health capability handlers (ported from apps/web/lib/people.ts + capabilities/healthAnomalyAlert.ts)."""

from __future__ import annotations

import json
import re
from typing import Any

import httpx

from ..db import get_supabase
from ..trace import add_step
from ..config import get_settings
from ..models import HealthAnomalyAlert, PatientDecision
from ..personas.patient_health import build_patient_health_prompt
from ..llm.deterministic import generate_patient_decision


async def handle_health_summary(handle: str) -> dict:
    db = get_supabase()

    res = db.table("humans").select("id").eq("handle", handle).single().execute()
    if not res.data:
        return {"ok": False, "data": {"error": "user_not_found"}}

    human_id = res.data["id"]

    metrics_res = (
        db.table("health_metrics")
        .select("*")
        .eq("human_id", human_id)
        .order("date", desc=True)
        .limit(30)
        .execute()
    )

    metrics = metrics_res.data or []
    if not metrics:
        return {"ok": False, "data": {"error": "no_health_data"}}

    n = len(metrics)
    sleep_avg = sum(m["sleep_hours"] for m in metrics) / n
    steps_avg = sum(m["steps"] for m in metrics) / n
    adherent_days = sum(1 for m in metrics if m["med_adherence"])
    avg_symptom = sum(m["symptom_score"] for m in metrics) / n

    # Trends: compare first half vs second half
    half = n // 2
    recent = metrics[:half] if half > 0 else metrics
    older = metrics[half:] if half > 0 else metrics

    recent_sleep = sum(m["sleep_hours"] for m in recent) / len(recent) if recent else 0
    older_sleep = sum(m["sleep_hours"] for m in older) / len(older) if older else 0
    sleep_trend = "up" if recent_sleep > older_sleep + 0.3 else ("down" if recent_sleep < older_sleep - 0.3 else "flat")

    recent_steps = sum(m["steps"] for m in recent) / len(recent) if recent else 0
    older_steps = sum(m["steps"] for m in older) / len(older) if older else 0
    activity_trend = "up" if recent_steps > older_steps + 500 else ("down" if recent_steps < older_steps - 500 else "flat")

    # Flags
    sleep_flags: list[str] = []
    if sleep_avg < 6:
        sleep_flags.append("Below recommended 7h average")
    for m in metrics:
        if m["sleep_hours"] < 5:
            sleep_flags.append(f"Very low sleep on {m['date']}: {m['sleep_hours']}h")

    spikes: list[str] = []
    for m in metrics:
        if m["symptom_score"] > 7:
            spikes.append(f"Spike on {m['date']}: {m['symptom_score']}/10")

    notes: list[str] = []
    if adherent_days < n * 0.8:
        notes.append("Medication adherence below 80% — consider reminders.")
    if sleep_avg < 6.5:
        notes.append("Sleep average is low — may affect recovery.")

    summary = {
        "rangeDays": n,
        "sleep": {
            "avg": round(sleep_avg, 1),
            "trend": sleep_trend,
            "flags": sleep_flags[:5],
        },
        "activity": {
            "avgSteps": round(steps_avg),
            "trend": activity_trend,
        },
        "medication": {
            "adherencePct": round((adherent_days / n) * 100),
            "missedDays": n - adherent_days,
        },
        "symptoms": {
            "avgScore": round(avg_symptom, 1),
            "spikes": spikes[:5],
        },
        "notes": notes,
    }

    return {"ok": True, "data": summary}


async def handle_health_anomaly_alert(
    input_data: Any,
    trace_id: str,
    provider: str,
) -> dict:
    """Handle health.anomaly_alert capability."""
    try:
        anomaly = HealthAnomalyAlert.model_validate(input_data)
    except Exception as e:
        return {"ok": False, "data": {"error": f"invalid_payload: {e}"}}

    add_step(
        trace_id,
        actor=anomaly.user_handle,
        event="HEALTH_ANOMALY_RECEIVED",
        ok=True,
        data={
            "flags": anomaly.flags,
            "anomaly_score": anomaly.anomaly_score,
            "date": anomaly.date,
        },
    )

    # Try LLM, fall back to deterministic
    settings = get_settings()
    api_key = settings.openai_api_key if provider == "openai" else settings.anthropic_api_key

    if api_key:
        try:
            decision = await _call_llm_for_decision(anomaly, provider, api_key)
        except Exception:
            decision = generate_patient_decision(anomaly)
    else:
        decision = generate_patient_decision(anomaly)

    add_step(
        trace_id,
        actor=anomaly.user_handle,
        event="PATIENT_DECISION",
        ok=True,
        provider=provider,
        data={
            "urgency": decision.urgency,
            "should_contact_clinic": decision.should_contact_clinic,
            "summary": decision.summary_explanation,
        },
    )

    return {"ok": True, "data": {"decision": decision.model_dump()}}


async def _call_llm_for_decision(
    anomaly: HealthAnomalyAlert,
    provider: str,
    api_key: str,
) -> PatientDecision:
    system_prompt = build_patient_health_prompt(anomaly)

    async with httpx.AsyncClient() as client:
        if provider == "openai":
            res = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
                json={
                    "model": "gpt-4o-mini",
                    "response_format": {"type": "json_object"},
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": "Analyze this anomaly and produce the JSON decision."},
                    ],
                    "max_tokens": 500,
                },
                timeout=30,
            )
            data = res.json()
            content = data.get("choices", [{}])[0].get("message", {}).get("content")
            if content:
                return PatientDecision.model_validate_json(content)
        else:
            res = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "Content-Type": "application/json",
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                },
                json={
                    "model": "claude-sonnet-4-5-20250929",
                    "max_tokens": 500,
                    "system": system_prompt,
                    "messages": [
                        {"role": "user", "content": "Analyze this anomaly and produce the JSON decision."},
                    ],
                },
                timeout=30,
            )
            data = res.json()
            text = data.get("content", [{}])[0].get("text")
            if text:
                match = re.search(r"\{[\s\S]*\}", text)
                if match:
                    return PatientDecision.model_validate_json(match.group(0))

    return generate_patient_decision(anomaly)
