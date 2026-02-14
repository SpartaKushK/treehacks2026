"""Triage capability handler (ported from apps/web/lib/capabilities/triageIntakeAndSchedule.ts)."""

from __future__ import annotations

import json
import re
from datetime import datetime, timedelta
from typing import Any

import httpx

from ..trace import add_step
from ..config import get_settings
from ..models import TriageRequest, TriageOutcome
from ..personas.doctor_receptionist import build_doctor_receptionist_prompt
from ..llm.deterministic import generate_triage_outcome


async def handle_triage_intake_and_schedule(
    input_data: Any,
    trace_id: str,
    provider: str,
) -> dict:
    try:
        req = TriageRequest.model_validate(input_data)
    except Exception as e:
        return {"ok": False, "data": {"error": f"invalid_payload: {e}"}}

    add_step(
        trace_id,
        actor="dr_smith",
        event="TRIAGE_REQUEST_RECEIVED",
        ok=True,
        data={
            "patient": req.patient_handle,
            "urgency": req.urgency,
            "flags": req.anomaly.flags,
        },
    )

    # Try LLM, fall back to deterministic
    settings = get_settings()
    api_key = settings.openai_api_key if provider == "openai" else settings.anthropic_api_key

    if api_key:
        try:
            outcome = await _call_llm_for_triage(req, provider, api_key)
        except Exception:
            outcome = generate_triage_outcome(req)
    else:
        outcome = generate_triage_outcome(req)

    # Add trace steps
    add_step(trace_id, actor="dr_smith", event="INTAKE_TURN_1", ok=True, data={"questions_asked": outcome.intake_questions_asked})
    add_step(trace_id, actor=req.patient_handle, event="INTAKE_TURN_2", ok=True, data={"answers": outcome.intake_answers})
    add_step(trace_id, actor="dr_smith", event="APPOINTMENT_PROPOSED", ok=True, data={"slots": [s.model_dump() for s in outcome.proposed_slots], "urgency": outcome.urgency})
    add_step(trace_id, actor="dr_smith", event="APPOINTMENT_BOOKED", ok=True, data={"booking": outcome.booking_confirmation.model_dump(), "escalation_triggered": outcome.escalation_triggered})

    return {"ok": True, "data": {"outcome": outcome.model_dump()}}


def _generate_time_slots_for_prompt(urgency: str) -> list[dict]:
    now = datetime.now()
    slots: list[dict] = []
    day_offset = 0 if urgency == "urgent" else (1 if urgency == "soon" else 3)

    for i in range(3):
        d = now + timedelta(days=day_offset + i)
        while d.weekday() >= 5:
            d += timedelta(days=1)
        hours = [9, 11, 14]
        d = d.replace(hour=hours[i], minute=0, second=0, microsecond=0)
        end = d.replace(minute=30)
        slots.append({"start": d.isoformat(), "end": end.isoformat()})

    return slots


async def _call_llm_for_triage(
    req: TriageRequest,
    provider: str,
    api_key: str,
) -> TriageOutcome:
    system_prompt = build_doctor_receptionist_prompt(req)
    slots = _generate_time_slots_for_prompt(req.urgency)
    user_msg = (
        f"Patient answers: {json.dumps(req.patient_answers or {{}})}. "
        f"Available appointment slots: {json.dumps(slots)}. Generate the triage outcome JSON."
    )

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
                        {"role": "user", "content": user_msg},
                    ],
                    "max_tokens": 600,
                },
                timeout=30,
            )
            data = res.json()
            content = data.get("choices", [{}])[0].get("message", {}).get("content")
            if content:
                return TriageOutcome.model_validate_json(content)
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
                    "max_tokens": 600,
                    "system": system_prompt,
                    "messages": [{"role": "user", "content": user_msg}],
                },
                timeout=30,
            )
            data = res.json()
            text = data.get("content", [{}])[0].get("text")
            if text:
                match = re.search(r"\{[\s\S]*\}", text)
                if match:
                    return TriageOutcome.model_validate_json(match.group(0))

    return generate_triage_outcome(req)
