"""
Scheduling Agent — Agent-to-Agent Appointment Negotiation

This agent:
1. Fetches the doctor's available slots from Google Calendar
2. POSTs a SlotProposal to the patient's agent endpoint
3. Waits for the patient agent to respond (via our /schedule/response callback)
4. If accepted: creates the calendar event on both sides
5. If rejected: proposes the next batch of slots (up to MAX_SCHEDULING_ROUNDS)

The patient agent lives at alert.patient_agent_url and follows the same
SlotProposal / SlotResponse protocol defined in models/schemas.py.

Google Calendar integration lives in tools/calendar.py. It uses real freebusy
queries when service account credentials are configured, and falls back to
deterministic mock data otherwise. See GOOGLE_SETUP.md for credentials setup.
"""

import asyncio
import logging
import uuid
from datetime import datetime
from typing import Optional

import httpx

from models.schemas import (
    TriageResult, SlotProposal, SlotResponse, TimeSlot, Severity
)
import config
from api.routes import active_sessions
from tools.calendar import get_free_slots, create_event

logger = logging.getLogger(__name__)


# Calendar integration now lives in tools/calendar.py
# get_free_slots() uses real Google Calendar when credentials are configured,
# and falls back to deterministic mock data otherwise.


# ─── Scheduling Loop ──────────────────────────────────────────────────────────

async def wait_for_patient_response(proposal_id: str, timeout_seconds: int = 60) -> Optional[SlotResponse]:
    """
    Poll active_sessions for a response from the patient agent.
    In production, replace with an async pub/sub or webhook with proper waiting.
    """
    key = f"slot_response_{proposal_id}"
    deadline = asyncio.get_event_loop().time() + timeout_seconds
    poll_interval = 1.0

    while asyncio.get_event_loop().time() < deadline:
        if key in active_sessions:
            data = active_sessions.pop(key)
            return SlotResponse(**data)
        await asyncio.sleep(poll_interval)

    logger.warning(f"Timed out waiting for patient response to proposal {proposal_id}")
    return None


async def run_scheduling(triage: TriageResult, session_id: str) -> Optional[TimeSlot]:
    """
    Main scheduling loop. Negotiates appointment time with the patient agent.
    Returns the confirmed TimeSlot, or None if negotiation failed.
    """
    alert = triage.alert
    urgency_hours = triage.appointment_urgency_hours or (24 * 7)

    logger.info(
        f"[{session_id}] Starting scheduling for {alert.patient_name}, "
        f"type={triage.appointment_type}, urgency={urgency_hours}h"
    )

    doctor_slots = get_free_slots(urgency_hours)

    for round_num in range(1, config.MAX_SCHEDULING_ROUNDS + 1):
        if not doctor_slots:
            logger.warning(f"[{session_id}] No more doctor slots to offer.")
            break

        # Take next batch of up to 3 slots to propose
        proposed = doctor_slots[:3]
        doctor_slots = doctor_slots[3:]  # remaining for next round
        proposal_id = str(uuid.uuid4())

        proposal = SlotProposal(
            proposal_id=proposal_id,
            doctor_name=config.DOCTOR_NAME,
            doctor_id=config.DOCTOR_ID,
            patient_id=alert.patient_id,
            alert_summary=triage.action_summary,
            appointment_type=triage.appointment_type,
            duration_minutes=config.APPOINTMENT_DURATION_MINUTES,
            proposed_slots=proposed,
            message=(
                f"Hello {alert.patient_name}, your recent health alert has been reviewed. "
                f"We'd like to schedule a {triage.appointment_type}. "
                f"Please select one of these available times, or we can find alternatives."
            ),
            round=round_num,
            forms_to_complete=triage.recommended_forms or None,
        )

        logger.info(f"[{session_id}] Round {round_num}: sending {len(proposed)} slot options to patient agent")

        # POST proposal to patient agent
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    alert.patient_agent_url,
                    json=proposal.model_dump(mode="json"),
                )
                resp.raise_for_status()
                logger.info(f"[{session_id}] Proposal sent, patient agent responded: {resp.status_code}")
        except httpx.HTTPError as e:
            logger.error(f"[{session_id}] Failed to reach patient agent: {e}")
            break

        # Wait for patient agent to call back our /schedule/response
        logger.info(f"[{session_id}] Waiting for patient agent response...")
        response = await wait_for_patient_response(proposal_id, timeout_seconds=120)

        if response is None:
            logger.warning(f"[{session_id}] No response from patient agent in round {round_num}")
            continue

        if response.accepted and response.selected_slot:
            logger.info(f"[{session_id}] ✅ Appointment confirmed: {response.selected_slot.label}")

            # Create the calendar event for both doctor and patient
            event_id = create_event(
                slot=response.selected_slot,
                patient_name=alert.patient_name,
                patient_email=alert.patient_email,
                appointment_type=triage.appointment_type,
                description=triage.action_summary,
            )
            if event_id:
                logger.info(f"[{session_id}] Calendar event created: {event_id}")

            return response.selected_slot
        else:
            logger.info(
                f"[{session_id}] Patient agent rejected round {round_num} slots. "
                f"Reason: {response.counter_message}"
            )

    logger.warning(f"[{session_id}] Scheduling failed after {config.MAX_SCHEDULING_ROUNDS} rounds")
    return None
