"""
API Routes for the Doctor Agent.

POST /agent             — Unified endpoint: action=get_availability | action=alert (agent decides the call)
GET  /health            — Health check
POST /alert             — Receive a health alert (legacy; prefer POST /agent with action=alert)
POST /schedule/response  — Receive scheduling responses from the patient agent (callback)
"""

import logging
import uuid
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse

from models.schemas import (
    HealthAlert, AlertResponse, SlotResponse, Severity, TriageResult,
    PlatformTriageRequest, PlatformTriageOutcome, AlertType,
    AgentRequest, AgentRequestGetAvailability, AgentResponseAvailability, AgentResponseAlert,
)
from agents.triage import run_triage
from tools.calendar import get_free_slots, create_event

logger = logging.getLogger(__name__)
router = APIRouter()


# ─── In-memory store for active scheduling sessions ───────────────────────────
# In production, replace with Redis or a database
active_sessions: dict[str, dict] = {}


# ─── Helper ───────────────────────────────────────────────────────────────────

async def process_alert_background(alert: HealthAlert, session_id: str):
    """
    Full pipeline: triage → schedule → forms.
    Runs in the background so the API returns immediately.
    """
    try:
        # Step 1: Triage
        logger.info(f"[{session_id}] Starting triage for {alert.patient_id}")
        triage_result: TriageResult = run_triage(alert)

        active_sessions[session_id]["triage_result"] = triage_result.model_dump(mode="json")
        active_sessions[session_id]["status"] = "triage_complete"

        logger.info(
            f"[{session_id}] Triage complete: severity={triage_result.severity}, "
            f"escalate={triage_result.should_escalate}"
        )

        # Step 2: Route based on triage outcome
        if triage_result.should_escalate:
            active_sessions[session_id]["status"] = "escalated"
            # TODO: trigger escalation actions (SMS, pager, etc.)
            logger.critical(f"[{session_id}] 🚨 Escalation: {triage_result.escalation_reason}")
            return

        if triage_result.appointment_urgency_hours is not None:
            active_sessions[session_id]["status"] = "scheduling"
            # Step 3: Start scheduling (agent-to-agent negotiation)
            # This is imported here to avoid circular imports
            from agents.scheduler import run_scheduling
            appointment = await run_scheduling(triage_result, session_id)

            if appointment:
                active_sessions[session_id]["appointment"] = appointment
                active_sessions[session_id]["status"] = "appointment_confirmed"
            else:
                active_sessions[session_id]["status"] = "scheduling_failed"

        # Step 4: Send forms regardless (if any recommended)
        if triage_result.recommended_forms:
            from agents.forms import send_forms
            await send_forms(alert, triage_result)
            active_sessions[session_id]["forms_sent"] = True

        active_sessions[session_id]["status"] = "complete"

    except Exception as e:
        logger.exception(f"[{session_id}] Pipeline error: {e}")
        active_sessions[session_id]["status"] = "error"
        active_sessions[session_id]["error"] = str(e)


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.get("/health")
async def health_check():
    return {"status": "ok", "service": "doctor-agent", "timestamp": datetime.utcnow().isoformat()}


@router.post("/agent")
async def unified_agent(req: AgentRequest, background_tasks: BackgroundTasks):
    """
    Single POST endpoint. Caller sends action + payload; Doctor Agent runs the
    appropriate logic (e.g. get_availability = read calendar only, alert = full pipeline).
    """
    if req.action == "get_availability":
        opts = req.get_availability or AgentRequestGetAvailability()
        hours_ahead = opts.hours_ahead
        max_slots = opts.max_slots
        # Fetch slots (urgency_hours=0 => start soon; we filter to hours_ahead)
        raw_slots = get_free_slots(urgency_hours=0, max_slots=max(20, max_slots))
        now = datetime.now(timezone.utc)
        cutoff = now + timedelta(hours=hours_ahead)
        slots_in_window = [s for s in raw_slots if s.start <= cutoff][:max_slots]
        return AgentResponseAvailability(
            slots=[
                {
                    "start": s.start.isoformat(),
                    "end": s.end.isoformat(),
                    "label": s.label,
                }
                for s in slots_in_window
            ]
        ).model_dump(mode="json")

    if req.action == "alert":
        if not req.alert:
            raise HTTPException(status_code=400, detail="action=alert requires 'alert' payload")
        session_id = str(uuid.uuid4())
        active_sessions[session_id] = {
            "session_id": session_id,
            "patient_id": req.alert.patient_id,
            "alert_type": req.alert.alert_type,
            "status": "received",
            "created_at": datetime.utcnow().isoformat(),
        }
        background_tasks.add_task(process_alert_background, req.alert, session_id)
        return AgentResponseAlert(
            status="processing",
            triage_severity=Severity.MEDIUM,
            action_taken=f"Alert received. Processing started (session: {session_id}).",
            message=f"Your alert has been received and is being reviewed. Session: {session_id}.",
            session_id=session_id,
        ).model_dump(mode="json")

    raise HTTPException(status_code=400, detail=f"Unknown action: {req.action}")


@router.post("/alert", response_model=AlertResponse)
async def receive_alert(alert: HealthAlert, background_tasks: BackgroundTasks):
    """
    Primary endpoint. Receives a health alert from any patient device or EHR system.

    Returns immediately with a session ID (processing happens asynchronously).
    Poll GET /alert/{session_id}/status for updates, or use webhooks.
    """
    logger.info(f"[alert] received for patient={alert.patient_id}, type={alert.alert_type}, patient_agent_url={alert.patient_agent_url}")
    session_id = str(uuid.uuid4())

    # Create session record
    active_sessions[session_id] = {
        "session_id": session_id,
        "patient_id": alert.patient_id,
        "alert_type": alert.alert_type,
        "status": "received",
        "created_at": datetime.utcnow().isoformat(),
    }

    logger.info(
        f"Alert received: session={session_id}, patient={alert.patient_id}, "
        f"type={alert.alert_type}"
    )

    # Run the full pipeline in the background
    background_tasks.add_task(process_alert_background, alert, session_id)

    # Return immediately — don't make the caller wait for Claude
    return AlertResponse(
        status="processing",
        triage_severity=Severity.MEDIUM,   # placeholder until triage runs
        action_taken=f"Alert received. Processing started (session: {session_id}).",
        message=(
            f"Your alert has been received and is being reviewed by {alert.patient_name}'s "
            f"care team. You will be contacted shortly."
        )
    )


@router.get("/alert/{session_id}/status")
async def get_alert_status(session_id: str):
    """Poll this endpoint to check on the processing status of an alert."""
    if session_id not in active_sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    session = active_sessions[session_id]

    # If triage is done, include severity in response
    response = {"session_id": session_id, **session}

    # Don't expose full message history
    if "triage_result" in response:
        tr = response["triage_result"]
        response["triage_summary"] = {
            "severity": tr.get("severity"),
            "appointment_type": tr.get("appointment_type"),
            "action_summary": tr.get("action_summary"),
            "forms_count": len(tr.get("recommended_forms", [])),
        }
        del response["triage_result"]

    return response


@router.post("/schedule/response")
async def receive_scheduling_response(response: SlotResponse):
    """
    Callback endpoint for the patient agent to respond to slot proposals.

    The patient agent POSTs here when accepting or rejecting proposed times.
    The doctor agent's scheduling loop picks this up to continue negotiation.
    """
    logger.info(
        f"Scheduling response received: proposal={response.proposal_id}, "
        f"patient={response.patient_id}, accepted={response.accepted}"
    )

    # Store the response where the scheduler can find it
    key = f"slot_response_{response.proposal_id}"
    active_sessions[key] = response.model_dump(mode="json")

    return {"status": "received", "proposal_id": response.proposal_id}


@router.get("/sessions")
async def list_sessions():
    """Debug endpoint — list all active sessions."""
    return {
        "count": len(active_sessions),
        "sessions": [
            {
                "session_id": k,
                "patient_id": v.get("patient_id"),
                "status": v.get("status"),
                "created_at": v.get("created_at"),
            }
            for k, v in active_sessions.items()
            if not k.startswith("slot_response_")
        ]
    }


# ─── Platform Bridge ──────────────────────────────────────────────────────────
# This endpoint allows the Next.js People API to delegate triage to the
# Python Doctor Agent. It accepts the TS TriageRequest schema and returns
# a TriageOutcome in the same format the TS codebase expects.

def _flags_to_alert_type(flags: list[str]) -> AlertType:
    """Map anomaly flags to a primary AlertType."""
    flag_map = {
        "RHR_SPIKE": AlertType.ELEVATED_HEART_RATE,
        "SLEEP_DROP": AlertType.SLEEP_APNEA_RISK,
        "HRV_DROP": AlertType.CARDIO_RECOVERY_LOW,
        "STEPS_DROP": AlertType.CARDIO_RECOVERY_LOW,
    }
    for flag in flags:
        if flag in flag_map:
            return flag_map[flag]
    return AlertType.UNKNOWN


def _urgency_to_hours(urgency: str) -> int:
    """Map TS urgency levels to appointment_urgency_hours."""
    return {"urgent": 4, "soon": 48, "routine": 168}.get(urgency, 168)


@router.post("/triage/platform", response_model=PlatformTriageOutcome)
async def platform_triage(req: PlatformTriageRequest):
    """
    Bridge endpoint for the Next.js platform.

    Accepts the TS TriageRequest format (from packages/shared), runs the
    full Claude triage pipeline, and returns a TriageOutcome that the TS
    orchestrator can consume directly.
    """
    import config

    # ── Translate PlatformTriageRequest → HealthAlert ───────────────────
    metrics = req.anomaly.metrics
    primary_type = _flags_to_alert_type(req.anomaly.flags)

    # Pick the most relevant metric for the alert
    metric_value = None
    metric_unit = None
    threshold = None
    if metrics.resting_hr_bpm is not None and req.anomaly.baseline.rhr_mean:
        metric_value = metrics.resting_hr_bpm
        metric_unit = "bpm"
        threshold = req.anomaly.baseline.rhr_mean
    elif metrics.sleep_hours is not None and req.anomaly.baseline.sleep_mean:
        metric_value = metrics.sleep_hours
        metric_unit = "hours"
        threshold = req.anomaly.baseline.sleep_mean

    alert = HealthAlert(
        patient_id=req.patient_handle,
        patient_name=req.patient_handle,  # platform may not have full name
        patient_email=f"{req.patient_handle}@people-api.local",
        alert_type=primary_type,
        metric_value=metric_value,
        metric_unit=metric_unit,
        threshold_value=threshold,
        description=req.message,
        patient_agent_url=f"{config.DOCTOR_AGENT_BASE_URL}/schedule/response",
    )

    # ── Run the triage ──────────────────────────────────────────────────
    triage_result: TriageResult = run_triage(alert)

    # ── Translate TriageResult → PlatformTriageOutcome ──────────────────
    urgency_hours = triage_result.appointment_urgency_hours or _urgency_to_hours(req.urgency)
    slots = get_free_slots(urgency_hours, max_slots=3)

    # Generate intake questions based on triage
    questions = [
        "How long have you been experiencing these symptoms?",
        "On a scale of 1-10, how would you rate your discomfort right now?",
        "Do you have any known allergies or chronic conditions?",
    ]
    answers = req.patient_answers or {
        questions[0]: "A few days",
        questions[1]: "5",
        questions[2]: "No known allergies",
    }

    chosen_slot = slots[0] if slots else None
    method = "in_person" if req.urgency == "urgent" else "telehealth"

    # ── Create Google Calendar event for the booked slot ──────────────
    calendar_event_id = None
    if chosen_slot:
        try:
            calendar_event_id = create_event(
                slot=chosen_slot,
                patient_name=req.patient_handle,
                patient_email=f"{req.patient_handle}@people-api.local",
                appointment_type=f"{method} — {triage_result.appointment_type}",
                description=(
                    f"Auto-scheduled by Doctor Agent.\n"
                    f"Triage severity: {triage_result.severity.value}\n"
                    f"Urgency: {req.urgency}\n"
                    f"Anomaly score: {req.anomaly.anomaly_score}\n"
                    f"Flags: {', '.join(req.anomaly.flags)}"
                ),
            )
            logger.info(f"Calendar event created: {calendar_event_id}")
        except Exception as e:
            logger.error(f"Failed to create calendar event: {e}")

    return PlatformTriageOutcome(
        intake_questions_asked=questions,
        intake_answers=answers,
        urgency=req.urgency,
        proposed_slots=[
            {"start": s.start.isoformat(), "end": s.end.isoformat()}
            for s in slots
        ],
        booking_confirmation={
            "start": chosen_slot.start.isoformat() if chosen_slot else "",
            "end": chosen_slot.end.isoformat() if chosen_slot else "",
            "method": method,
        },
        escalation_triggered=triage_result.should_escalate,
        calendar_event_id=calendar_event_id,
    )
