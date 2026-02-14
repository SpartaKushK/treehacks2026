"""Deterministic fallback logic (ported from apps/web/lib/triage/deterministic.ts)."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Literal

from ..models import HealthAnomalyAlert, PatientDecision, TriageRequest, TriageOutcome, TimeSlot, BookingConfirmation


def determine_urgency(
    anomaly_score: int,
    flags: list[str],
    thresholds: dict | None = None,
) -> Literal["routine", "soon", "urgent"]:
    urgent_threshold = (thresholds or {}).get("urgent", 85)
    soon_threshold = (thresholds or {}).get("soon", 70)
    if anomaly_score >= urgent_threshold:
        return "urgent"
    if "SLEEP_DROP" in flags and "RHR_SPIKE" in flags:
        return "urgent"
    if anomaly_score >= soon_threshold:
        return "soon"
    return "routine"


def should_contact_clinic(urgency: str) -> bool:
    return urgency != "routine"


def generate_questions(urgency: str, flags: list[str]) -> list[str]:
    questions: list[str] = []
    if "SLEEP_DROP" in flags:
        questions.append("Have you had trouble falling or staying asleep recently?")
        questions.append("Have you changed your bedtime routine or started any new medications?")
    if "RHR_SPIKE" in flags:
        questions.append("Have you experienced heart palpitations, chest tightness, or shortness of breath?")
        questions.append("Have you been under unusual stress or consumed more caffeine than normal?")
    if "STEPS_DROP" in flags:
        questions.append("Have you been less physically active due to pain, fatigue, or other symptoms?")
    if "HRV_DROP" in flags:
        questions.append("Have you been feeling more anxious or fatigued than usual?")

    generic = [
        "Are you currently experiencing any pain or discomfort?",
        "Have you noticed any other changes in how you feel day-to-day?",
        "Are you taking all prescribed medications as directed?",
        "Have you had any recent illness, injury, or major life changes?",
    ]
    while len(questions) < 3:
        questions.append(generic[len(questions)])

    return questions[:6]


def generate_patient_decision(anomaly: HealthAnomalyAlert) -> PatientDecision:
    urgency = determine_urgency(anomaly.anomaly_score, anomaly.flags)
    contact_clinic = should_contact_clinic(urgency)
    questions = generate_questions(urgency, anomaly.flags)

    flag_desc = (
        " and ".join(f.replace("_", " ").lower() for f in anomaly.flags)
        if anomaly.flags
        else "minor deviations"
    )

    suffix = (
        " We recommend contacting your clinic."
        if urgency != "routine"
        else " No immediate action needed, but keep monitoring."
    )

    return PatientDecision(
        summary_explanation=(
            f"Your wearable data from {anomaly.date} shows {flag_desc} compared to your 28-day baseline. "
            f"Your anomaly score is {anomaly.anomaly_score}/100, which is classified as \"{urgency}\".{suffix}"
        ),
        questions=questions,
        recommended_next_step=(
            f"Schedule a {'same-day' if urgency == 'urgent' else 'follow-up'} appointment with Dr. Smith."
            if contact_clinic
            else "Continue monitoring your metrics. Re-check in 48 hours."
        ),
        should_contact_clinic=contact_clinic,
        urgency=urgency,
        clinic_message=(
            f"Patient {anomaly.user_handle} health anomaly: score {anomaly.anomaly_score}/100, "
            f"flags: {', '.join(anomaly.flags)}. Urgency: {urgency}. "
            f"Please schedule {'immediate' if urgency == 'urgent' else 'a follow-up'} appointment."
            if contact_clinic
            else None
        ),
    )


def generate_mock_slots(urgency: str) -> list[TimeSlot]:
    now = datetime.now()
    slots: list[TimeSlot] = []

    if urgency == "urgent":
        day_offset = 0
    elif urgency == "soon":
        day_offset = 1
    else:
        day_offset = 3

    hours = [9, 11, 14] if urgency == "urgent" else [10, 13, 15]

    for i in range(3):
        d = now + timedelta(days=day_offset + i)
        # Skip weekends
        while d.weekday() >= 5:
            d += timedelta(days=1)

        d = d.replace(hour=hours[i], minute=0, second=0, microsecond=0)
        end = d.replace(minute=30)
        slots.append(TimeSlot(start=d.isoformat(), end=end.isoformat()))

    return slots


def generate_triage_outcome(req: TriageRequest) -> TriageOutcome:
    questions = [
        "How long have you been experiencing these symptoms?",
        "On a scale of 1-10, how would you rate your discomfort right now?",
        "Do you have any known allergies or chronic conditions?",
    ]

    default_answers = {
        questions[0]: "A few days",
        questions[1]: "7" if req.urgency == "urgent" else ("5" if req.urgency == "soon" else "3"),
        questions[2]: "No known allergies",
    }

    answers = (
        req.patient_answers
        if req.patient_answers and len(req.patient_answers) > 0
        else default_answers
    )

    slots = generate_mock_slots(req.urgency)
    chosen_slot = slots[0]
    method: Literal["in_person", "telehealth"] = "in_person" if req.urgency == "urgent" else "telehealth"

    return TriageOutcome(
        intake_questions_asked=questions,
        intake_answers=answers,
        urgency=req.urgency,
        proposed_slots=slots,
        booking_confirmation=BookingConfirmation(
            start=chosen_slot.start,
            end=chosen_slot.end,
            method=method,
        ),
        escalation_triggered=(req.urgency == "urgent" and "RHR_SPIKE" in req.anomaly.flags),
    )
