"""Trace management: in-memory buffer + Supabase persistence.

Ported from apps/web/lib/trace.ts.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from dataclasses import dataclass, field
from typing import Any

from .db import get_supabase


@dataclass
class TraceStep:
    t: str
    actor: str
    event: str
    ok: bool
    data: Any = None
    provider: str | None = None

    def to_dict(self) -> dict:
        d: dict[str, Any] = {"t": self.t, "actor": self.actor, "event": self.event, "ok": self.ok}
        if self.data is not None:
            d["data"] = self.data
        if self.provider is not None:
            d["provider"] = self.provider
        return d


@dataclass
class LiveTrace:
    provider: str
    title: str
    steps: list[TraceStep] = field(default_factory=list)
    child_calls: list[dict] = field(default_factory=list)


# In-memory buffer for active traces
_live_traces: dict[str, LiveTrace] = {}


def start_trace(provider: str, title: str) -> str:
    trace_id = str(uuid.uuid4())
    _live_traces[trace_id] = LiveTrace(provider=provider, title=title)
    return trace_id


def add_step(
    trace_id: str,
    *,
    actor: str,
    event: str,
    ok: bool,
    data: Any = None,
    provider: str | None = None,
) -> None:
    trace = _live_traces.get(trace_id)
    if not trace:
        return
    trace.steps.append(
        TraceStep(
            t=datetime.now(timezone.utc).isoformat(),
            actor=actor,
            event=event,
            ok=ok,
            data=data,
            provider=provider,
        )
    )


def add_child_call(
    trace_id: str,
    handle: str,
    capability: str,
    child_trace_id: str,
) -> None:
    trace = _live_traces.get(trace_id)
    if not trace:
        return
    trace.child_calls.append(
        {"handle": handle, "capability": capability, "childTraceId": child_trace_id}
    )


def finalize_trace(trace_id: str) -> dict | None:
    trace = _live_traces.pop(trace_id, None)
    if not trace:
        return None

    steps_json = json.dumps([s.to_dict() for s in trace.steps])

    db = get_supabase()
    db.table("traces").insert({
        "id": trace_id,
        "provider": trace.provider,
        "steps_json": steps_json,
    }).execute()

    return {"id": trace_id, "provider": trace.provider, "steps": [s.to_dict() for s in trace.steps]}


def get_trace(trace_id: str) -> dict | None:
    # Check live first
    live = _live_traces.get(trace_id)
    if live:
        return {
            "id": trace_id,
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "provider": live.provider,
            "steps": [s.to_dict() for s in live.steps],
            "child_calls": live.child_calls,
        }

    # Then DB
    db = get_supabase()
    res = db.table("traces").select("*").eq("id", trace_id).single().execute()
    if not res.data:
        return None

    record = res.data
    return {
        "id": record["id"],
        "createdAt": record["created_at"],
        "provider": record["provider"],
        "steps": json.loads(record["steps_json"]),
    }
