"""Capability dispatcher (ported from apps/web/lib/people.ts)."""

from __future__ import annotations

from typing import Any

from .scheduling import handle_schedule_propose, handle_schedule_counter, handle_schedule_confirm
from .health import handle_health_summary, handle_health_anomaly_alert
from .triage import handle_triage_intake_and_schedule


async def handle_capability(
    callee_handle: str,
    capability: str,
    input_data: Any,
    trace_id: str = "",
    provider: str = "claude",
) -> dict:
    """Route a capability invocation to the correct handler."""
    match capability:
        case "schedule_propose":
            return await handle_schedule_propose(callee_handle, input_data)
        case "schedule_counter":
            return await handle_schedule_counter(callee_handle, input_data)
        case "schedule_confirm":
            return await handle_schedule_confirm(input_data)
        case "health_summary":
            return await handle_health_summary(callee_handle)
        case "health.anomaly_alert":
            return await handle_health_anomaly_alert(input_data, trace_id, provider)
        case "triage.intake_and_schedule":
            return await handle_triage_intake_and_schedule(input_data, trace_id, provider)
        case "execute_trade":
            return {"ok": False, "data": {"error": "capability_not_implemented"}}
        case _:
            return {"ok": False, "data": {"error": "unknown_capability"}}
