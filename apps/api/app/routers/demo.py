"""Demo routes: /api/demo/seed, /api/demo/health, /api/demo/anomaly, /api/demo/schedule, /api/demo/trace/{id}."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, Query, Request

from ..db import get_supabase, get_private_key
from ..crypto import sign_payload, verify_signature
from ..capabilities.dispatcher import handle_capability
from ..policy import evaluate_policy
from ..trace import start_trace, add_step, add_child_call, finalize_trace, get_trace
from ..llm.base import get_planner, Provider
from ..seed import seed, ensure_seed
from ..models import HealthAnomalyAlert, TriageRequest

router = APIRouter(prefix="/api/demo", tags=["demo"])


@router.post("/seed")
async def seed_db():
    await seed()
    return {"ok": True, "message": "Database seeded."}


@router.get("/trace/{trace_id}")
async def get_trace_route(trace_id: str):
    trace = get_trace(trace_id)
    if not trace:
        raise HTTPException(status_code=404, detail="trace_not_found")
    return trace


@router.get("/health")
async def demo_health(
    doctor: str = Query(default="dr_smith"),
    patient: str = Query(default="pari"),
    provider: str = Query(default="claude"),
    premium: bool = Query(default=True),
):
    await ensure_seed()

    planner = get_planner(provider)  # type: ignore
    trace_id = start_trace(provider=provider, title=f"Health summary: {doctor} → {patient}")

    try:
        db = get_supabase()

        doctor_human = db.table("humans").select("*").eq("handle", doctor).single().execute()
        patient_human = db.table("humans").select("*").eq("handle", patient).single().execute()

        add_step(trace_id, actor="orchestrator", event="registry_lookup", ok=bool(doctor_human.data and patient_human.data), data={"doctor": doctor, "patient": patient})

        if not doctor_human.data or not patient_human.data:
            finalize_trace(trace_id)
            raise HTTPException(status_code=404, detail="user_not_found")

        # Sign request
        doctor_sk = get_private_key(doctor)
        if not doctor_sk:
            finalize_trace(trace_id)
            raise HTTPException(status_code=500, detail="no_private_key")

        scopes = ["medical_read", "premium"] if premium else ["medical_read"]

        invoke_payload = {
            "capability": "health_summary",
            "scopes": scopes,
            "input": {"patientHandle": patient},
            "nonce": str(uuid.uuid4()),
            "timestamp": int(datetime.now().timestamp() * 1000),
        }

        sig = sign_payload(invoke_payload, doctor_sk)
        add_step(trace_id, actor=doctor, event="sign_payload", ok=True, data={"capability": "health_summary"})

        verified = verify_signature(invoke_payload, sig, doctor_human.data["public_key"])
        add_step(trace_id, actor=patient, event="signature_verified", ok=verified, data={"verified": verified})

        policy = await evaluate_policy(patient, doctor, "health_summary", scopes)
        add_step(trace_id, actor=patient, event="policy_allow" if policy.allowed else ("payment_required" if policy.payment_required else "policy_deny"), ok=policy.allowed, data={"allowed": policy.allowed, "reason": policy.reason})

        if not policy.allowed:
            finalize_trace(trace_id)
            if policy.payment_required:
                return {"error": "payment_required", "checkoutUrl": policy.checkout_url, "priceCents": policy.price_cents, "traceId": trace_id}
            raise HTTPException(status_code=403, detail=policy.reason)

        add_step(trace_id, actor=doctor, event="invoke_request", ok=True, data={"target": patient, "capability": "health_summary"})

        result = await handle_capability(patient, "health_summary", {"patientHandle": patient})
        add_step(trace_id, actor=patient, event="capability_result", ok=result["ok"], data=result.get("data"))

        if result["ok"]:
            summary = result["data"]
            explanation = await planner.explain_health_summary(summary)
            add_step(trace_id, actor=doctor, event="llm_plan", ok=True, data=explanation, provider=provider)
            summary["patientFriendlyText"] = explanation.get("patientFriendlyText", "")
            finalize_trace(trace_id)
            return {"traceId": trace_id, "healthSummary": summary, "provider": provider}

        finalize_trace(trace_id)
        raise HTTPException(status_code=500, detail="health_summary_failed")

    except HTTPException:
        raise
    except Exception as err:
        add_step(trace_id, actor="orchestrator", event="error", ok=False, data={"error": str(err)})
        finalize_trace(trace_id)
        raise HTTPException(status_code=500, detail=str(err))


@router.get("/anomaly")
async def demo_anomaly(
    severity: str = Query(default="severe"),
    provider: str = Query(default="claude"),
):
    await ensure_seed()

    trace_id = start_trace(provider=provider, title=f"Anomaly alert: pari ({severity})")

    try:
        anomaly_data: dict
        if severity == "severe":
            anomaly_data = {
                "user_handle": "pari",
                "date": datetime.now().strftime("%Y-%m-%d"),
                "baseline_window_days": 28,
                "metrics": {"sleep_hours": 4.2, "resting_hr_bpm": 88, "steps": 2100, "hrv_ms": 22},
                "baseline": {"sleep_mean": 7.1, "sleep_std": 0.6, "rhr_mean": 62, "rhr_std": 3, "steps_mean": 7500, "steps_std": 1200},
                "flags": ["SLEEP_DROP", "RHR_SPIKE", "STEPS_DROP", "HRV_DROP"],
                "anomaly_score": 92,
                "freeform_context": "Feeling very tired and heart racing since yesterday.",
            }
        else:
            anomaly_data = {
                "user_handle": "pari",
                "date": datetime.now().strftime("%Y-%m-%d"),
                "baseline_window_days": 28,
                "metrics": {"sleep_hours": 5.8, "resting_hr_bpm": 68, "steps": 5200},
                "baseline": {"sleep_mean": 7.1, "sleep_std": 0.6, "rhr_mean": 62, "rhr_std": 3, "steps_mean": 7500, "steps_std": 1200},
                "flags": ["SLEEP_DROP"],
                "anomaly_score": 55,
            }

        db = get_supabase()

        # Registry lookup
        pari = db.table("humans").select("*").eq("handle", "pari").single().execute()
        add_step(trace_id, actor="orchestrator", event="registry_lookup", ok=bool(pari.data), data={"handle": "pari", "found": bool(pari.data)})

        if not pari.data:
            finalize_trace(trace_id)
            raise HTTPException(status_code=404, detail="user_not_found")

        pari_sk = get_private_key("pari")
        if not pari_sk:
            finalize_trace(trace_id)
            raise HTTPException(status_code=500, detail="no_private_key")

        invoke_payload = {
            "capability": "health.anomaly_alert",
            "scopes": ["health:write"],
            "input": anomaly_data,
            "nonce": str(uuid.uuid4()),
            "timestamp": int(datetime.now().timestamp() * 1000),
        }

        sig = sign_payload(invoke_payload, pari_sk)
        add_step(trace_id, actor="pari", event="sign_payload", ok=True, data={"capability": "health.anomaly_alert"})

        verified = verify_signature(invoke_payload, sig, pari.data["public_key"])
        add_step(trace_id, actor="pari", event="signature_verified", ok=verified, data={"verified": verified})

        policy = await evaluate_policy("pari", "pari", "health.anomaly_alert", ["health:write"])
        add_step(trace_id, actor="pari", event="policy_allow" if policy.allowed else "policy_deny", ok=policy.allowed, data={"allowed": policy.allowed})

        result = await handle_capability("pari", "health.anomaly_alert", anomaly_data, trace_id=trace_id, provider=provider)

        if not result["ok"]:
            finalize_trace(trace_id)
            raise HTTPException(status_code=500, detail="anomaly_handler_failed")

        decision = result["data"]["decision"]
        triage_outcome = None

        # Escalation to dr_smith if needed
        if decision.get("should_contact_clinic"):
            add_step(trace_id, actor="pari", event="ESCALATED_TO_RECEPTIONIST", ok=True, data={"target": "dr_smith", "capability": "triage.intake_and_schedule", "urgency": decision["urgency"]})

            dr_smith = db.table("humans").select("*").eq("handle", "dr_smith").single().execute()
            add_step(trace_id, actor="orchestrator", event="registry_lookup", ok=bool(dr_smith.data), data={"handle": "dr_smith", "found": bool(dr_smith.data)})

            if dr_smith.data:
                triage_req = {
                    "patient_handle": "pari",
                    "anomaly": anomaly_data,
                    "urgency": decision["urgency"],
                    "message": decision.get("clinic_message", f"Anomaly alert: score {anomaly_data['anomaly_score']}"),
                }

                triage_payload = {
                    "capability": "triage.intake_and_schedule",
                    "scopes": ["triage:write"],
                    "input": triage_req,
                    "nonce": str(uuid.uuid4()),
                    "timestamp": int(datetime.now().timestamp() * 1000),
                }

                triage_sig = sign_payload(triage_payload, pari_sk)
                add_step(trace_id, actor="pari", event="sign_payload", ok=True, data={"capability": "triage.intake_and_schedule", "target": "dr_smith"})

                triage_verified = verify_signature(triage_payload, triage_sig, pari.data["public_key"])
                add_step(trace_id, actor="dr_smith", event="signature_verified", ok=triage_verified, data={"verified": triage_verified})

                triage_policy = await evaluate_policy("dr_smith", "pari", "triage.intake_and_schedule", ["triage:write"])
                add_step(trace_id, actor="dr_smith", event="policy_allow" if triage_policy.allowed else "policy_deny", ok=triage_policy.allowed, data={"allowed": triage_policy.allowed})

                if triage_policy.allowed:
                    add_child_call(trace_id, "dr_smith", "triage.intake_and_schedule", trace_id)
                    triage_result = await handle_capability("dr_smith", "triage.intake_and_schedule", triage_req, trace_id=trace_id, provider=provider)
                    if triage_result["ok"]:
                        triage_outcome = triage_result["data"]["outcome"]

        finalize_trace(trace_id)

        # Persist anomaly alert
        db.table("anomaly_alerts").insert({
            "human_id": pari.data["id"],
            "trace_id": trace_id,
            "severity": decision["urgency"],
            "anomaly_score": anomaly_data["anomaly_score"],
            "flags_json": json.dumps(anomaly_data["flags"]),
            "decision_json": json.dumps(decision),
            "triage_outcome_json": json.dumps(triage_outcome) if triage_outcome else None,
            "status": "active",
        }).execute()

        return {
            "traceId": trace_id,
            "severity": severity,
            "provider": provider,
            "decision": decision,
            "triage_outcome": triage_outcome,
        }

    except HTTPException:
        raise
    except Exception as err:
        add_step(trace_id, actor="orchestrator", event="error", ok=False, data={"error": str(err)})
        finalize_trace(trace_id)
        raise HTTPException(status_code=500, detail=str(err))


@router.post("/schedule")
async def demo_schedule(
    request: Request,
    from_handle: str = Query(default="pari", alias="from"),
    to_handle: str = Query(default="alex", alias="to"),
    provider: str = Query(default="claude"),
):
    await ensure_seed()

    planner = get_planner(provider)  # type: ignore
    trace_id = start_trace(provider=provider, title=f"Schedule: {from_handle} → {to_handle}")

    try:
        db = get_supabase()

        from_human = db.table("humans").select("*").eq("handle", from_handle).single().execute()
        to_human = db.table("humans").select("*").eq("handle", to_handle).single().execute()

        add_step(trace_id, actor="orchestrator", event="registry_lookup", ok=bool(from_human.data and to_human.data), data={"from": from_handle, "to": to_handle})

        if not from_human.data or not to_human.data:
            finalize_trace(trace_id)
            raise HTTPException(status_code=404, detail="user_not_found")

        # Time window
        next_mon = _get_next_monday()
        next_fri = next_mon + timedelta(days=4)
        next_fri = next_fri.replace(hour=18, minute=0, second=0, microsecond=0)

        time_window = {"start": next_mon.isoformat(), "end": next_fri.isoformat()}
        previous_messages: list[str] = []

        propose_input = {
            "title": "Coffee",
            "durationMins": 30,
            "timeWindow": time_window,
            "locationPrefs": ["near campus", "quiet"],
        }

        from_sk = get_private_key(from_handle)
        if not from_sk:
            finalize_trace(trace_id)
            raise HTTPException(status_code=500, detail="no_private_key")

        # Turn 0: Propose
        propose_payload = {
            "capability": "schedule_propose",
            "scopes": ["propose_meeting"],
            "input": propose_input,
            "nonce": str(uuid.uuid4()),
            "timestamp": int(datetime.now().timestamp() * 1000),
        }

        propose_sig = sign_payload(propose_payload, from_sk)
        add_step(trace_id, actor=from_handle, event="sign_payload", ok=True, data={"capability": "schedule_propose"})

        sig_verified = verify_signature(propose_payload, propose_sig, from_human.data["public_key"])
        add_step(trace_id, actor=to_handle, event="signature_verified", ok=sig_verified, data={"verified": sig_verified})

        policy1 = await evaluate_policy(to_handle, from_handle, "schedule_propose", ["propose_meeting"])
        add_step(trace_id, actor=to_handle, event="policy_allow" if policy1.allowed else "policy_deny", ok=policy1.allowed, data={"allowed": policy1.allowed})

        add_step(trace_id, actor=from_handle, event="invoke_request", ok=True, data={"target": to_handle, "capability": "schedule_propose"})

        propose_result = await handle_capability(to_handle, "schedule_propose", propose_input)
        add_step(trace_id, actor=to_handle, event="capability_result", ok=propose_result["ok"], data=propose_result.get("data"))

        proposed_slots = propose_result.get("data", {}).get("proposedSlots", [])

        plan0 = await planner.plan_scheduling_turn(turn=0, available_slots=proposed_slots, previous_messages=previous_messages, proposal=propose_input)
        add_step(trace_id, actor=from_handle, event="llm_plan", ok=True, data=plan0, provider=provider)
        previous_messages.append(plan0["message"])

        # Turn 1: Counter
        to_sk = get_private_key(to_handle)
        if not to_sk:
            finalize_trace(trace_id)
            raise HTTPException(status_code=500, detail="no_private_key")

        counter_payload = {
            "capability": "schedule_counter",
            "scopes": ["propose_meeting"],
            "input": {"proposedSlots": proposed_slots[:2], "durationMins": 30},
            "nonce": str(uuid.uuid4()),
            "timestamp": int(datetime.now().timestamp() * 1000),
        }

        counter_sig = sign_payload(counter_payload, to_sk)
        add_step(trace_id, actor=to_handle, event="sign_payload", ok=True, data={"capability": "schedule_counter"})

        sig_verified2 = verify_signature(counter_payload, counter_sig, to_human.data["public_key"])
        add_step(trace_id, actor=from_handle, event="signature_verified", ok=sig_verified2, data={"verified": sig_verified2})

        policy2 = await evaluate_policy(to_handle, from_handle, "schedule_counter", ["propose_meeting"])
        add_step(trace_id, actor=from_handle, event="policy_allow" if policy2.allowed else "policy_deny", ok=policy2.allowed)

        counter_result = await handle_capability(from_handle, "schedule_propose", {
            "title": "Coffee",
            "durationMins": 30,
            "timeWindow": time_window,
            "locationPrefs": ["near campus"],
        })
        add_step(trace_id, actor=from_handle, event="capability_result", ok=counter_result["ok"], data=counter_result.get("data"))

        plan1 = await planner.plan_scheduling_turn(turn=1, available_slots=proposed_slots, previous_messages=previous_messages, proposal=propose_input)
        add_step(trace_id, actor=to_handle, event="llm_plan", ok=True, data=plan1, provider=provider)
        previous_messages.append(plan1["message"])

        # Turn 2: Confirm
        chosen_slot = proposed_slots[0] if proposed_slots else None
        if not chosen_slot:
            add_step(trace_id, actor="orchestrator", event="error", ok=False, data={"error": "no_slots_available"})
            finalize_trace(trace_id)
            raise HTTPException(status_code=409, detail="no_slots_available")

        confirm_input = {"chosenSlot": chosen_slot, "title": "Coffee", "participants": [from_handle, to_handle]}

        confirm_payload = {
            "capability": "schedule_confirm",
            "scopes": ["propose_meeting"],
            "input": confirm_input,
            "nonce": str(uuid.uuid4()),
            "timestamp": int(datetime.now().timestamp() * 1000),
        }

        confirm_sig = sign_payload(confirm_payload, from_sk)
        add_step(trace_id, actor=from_handle, event="sign_payload", ok=True, data={"capability": "schedule_confirm"})

        sig_verified3 = verify_signature(confirm_payload, confirm_sig, from_human.data["public_key"])
        add_step(trace_id, actor=to_handle, event="signature_verified", ok=sig_verified3, data={"verified": sig_verified3})

        policy3 = await evaluate_policy(to_handle, from_handle, "schedule_confirm", ["propose_meeting"])
        add_step(trace_id, actor=to_handle, event="policy_allow" if policy3.allowed else "policy_deny", ok=policy3.allowed, data={"allowed": policy3.allowed})

        plan2 = await planner.plan_scheduling_turn(turn=2, available_slots=[chosen_slot], previous_messages=previous_messages, proposal=propose_input)
        add_step(trace_id, actor=from_handle, event="llm_plan", ok=True, data=plan2, provider=provider)

        confirm_result = await handle_capability(to_handle, "schedule_confirm", confirm_input)
        add_step(trace_id, actor=to_handle, event="capability_result", ok=confirm_result["ok"], data=confirm_result.get("data"))
        add_step(trace_id, actor="orchestrator", event="booking_confirmed", ok=True, data=confirm_result.get("data"))

        finalize_trace(trace_id)

        return {
            "traceId": trace_id,
            "bookingId": confirm_result.get("data", {}).get("bookingId"),
            "provider": provider,
            "messages": previous_messages,
            "chosenSlot": chosen_slot,
        }

    except HTTPException:
        raise
    except Exception as err:
        add_step(trace_id, actor="orchestrator", event="error", ok=False, data={"error": str(err)})
        finalize_trace(trace_id)
        raise HTTPException(status_code=500, detail=str(err))


def _get_next_monday() -> datetime:
    d = datetime.now()
    days_ahead = (7 - d.weekday()) % 7
    if days_ahead == 0:
        days_ahead = 7
    d = d + timedelta(days=days_ahead)
    return d.replace(hour=9, minute=0, second=0, microsecond=0)
