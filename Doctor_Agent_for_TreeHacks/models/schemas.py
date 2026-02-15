from pydantic import BaseModel, Field
from typing import Optional, List, Literal
from datetime import datetime
from enum import Enum


# ─── Alert Types ──────────────────────────────────────────────────────────────

class AlertType(str, Enum):
    ELEVATED_HEART_RATE     = "elevated_heart_rate"
    IRREGULAR_CARDIAC_RHYTHM = "irregular_cardiac_rhythm"
    LOW_BLOOD_OXYGEN        = "low_blood_oxygen"
    FALL_DETECTED           = "fall_detected"
    HIGH_RESPIRATORY_RATE   = "high_respiratory_rate"
    SLEEP_APNEA_RISK        = "sleep_apnea_risk"
    HIGH_NOISE_EXPOSURE     = "high_noise_exposure"
    CARDIO_RECOVERY_LOW     = "cardio_recovery_low"
    CHEST_PAIN_REPORTED     = "chest_pain_reported"
    HIGH_BLOOD_PRESSURE     = "high_blood_pressure"
    LOW_BLOOD_PRESSURE      = "low_blood_pressure"
    GLUCOSE_SPIKE           = "glucose_spike"
    UNKNOWN                 = "unknown"


class Severity(str, Enum):
    LOW      = "low"       # informational, no appointment needed
    MEDIUM   = "medium"    # schedule within 1 week
    HIGH     = "high"      # schedule within 24-48 hours
    CRITICAL = "critical"  # immediate escalation, call 911 protocol


# ─── Inbound Health Alert ──────────────────────────────────────────────────────

class HealthAlert(BaseModel):
    """
    Inbound payload from a patient device (Apple Watch, EHR, manual trigger, etc.)
    This is what hits POST /alert
    """
    patient_id: str = Field(..., description="Unique patient identifier")
    patient_name: str
    patient_email: str
    patient_phone: Optional[str] = None

    # The health data itself
    alert_type: AlertType
    metric_value: Optional[float] = Field(None, description="Measured value (e.g. 142 bpm)")
    metric_unit: Optional[str]    = Field(None, description="Unit of measurement (e.g. bpm, %)")
    threshold_value: Optional[float] = Field(None, description="Normal threshold that was exceeded")
    description: str = Field(..., description="Human-readable description of the alert")
    timestamp: datetime = Field(default_factory=datetime.utcnow)

    # Patient agent endpoint — this is what makes it agent-to-agent
    patient_agent_url: str = Field(
        ...,
        description="URL of the patient's scheduling agent. The doctor agent will POST proposed slots here."
    )

    # Optional: pre-supplied availability window hint
    preferred_days: Optional[List[str]] = Field(
        None,
        description="e.g. ['Monday', 'Wednesday', 'Friday']"
    )
    preferred_time_of_day: Optional[Literal["morning", "afternoon", "evening"]] = None

    class Config:
        json_schema_extra = {
            "example": {
                "patient_id": "pt_abc123",
                "patient_name": "Jane Doe",
                "patient_email": "jane@example.com",
                "patient_phone": "+16505550100",
                "alert_type": "elevated_heart_rate",
                "metric_value": 142.0,
                "metric_unit": "bpm",
                "threshold_value": 100.0,
                "description": "Resting heart rate of 142 bpm detected. Normal threshold is 100 bpm.",
                "patient_agent_url": "https://patient-agent.example.com/schedule",
                "preferred_days": ["Monday", "Wednesday"],
                "preferred_time_of_day": "morning"
            }
        }


# ─── Agent-to-Agent Scheduling Protocol ───────────────────────────────────────

class TimeSlot(BaseModel):
    start: datetime
    end: datetime
    label: Optional[str] = None  # e.g. "Monday morning"


class SlotProposal(BaseModel):
    """
    Doctor agent → Patient agent.
    Sent as POST to patient_agent_url.
    """
    proposal_id: str
    doctor_name: str
    doctor_id: str
    patient_id: str
    alert_summary: str
    appointment_type: str          # e.g. "Cardiac Follow-up", "Urgent Consultation"
    duration_minutes: int = 60
    proposed_slots: List[TimeSlot] = Field(..., min_length=1, max_length=5)
    message: str                   # Natural language message from doctor agent
    round: int = Field(1, description="Negotiation round number")
    forms_to_complete: Optional[List[str]] = None  # URLs of intake forms


class SlotResponse(BaseModel):
    """
    Patient agent → Doctor agent.
    Returned in response to SlotProposal (or POSTed back to doctor callback URL).
    """
    proposal_id: str
    patient_id: str
    accepted: bool
    selected_slot: Optional[TimeSlot] = None   # filled if accepted=True
    counter_message: Optional[str] = None       # filled if accepted=False
    unavailable_reasons: Optional[str] = None   # why none of those slots work


# ─── Triage Result ────────────────────────────────────────────────────────────

class TriageResult(BaseModel):
    """What the triage agent produces before handing off to sub-agents."""
    alert: HealthAlert
    severity: Severity
    reasoning: str
    appointment_type: str
    appointment_urgency_hours: Optional[int] = None  # None = no appt needed
    recommended_forms: List[str] = []
    should_escalate: bool = False
    escalation_reason: Optional[str] = None
    action_summary: str


# ─── API Responses ────────────────────────────────────────────────────────────

class AlertResponse(BaseModel):
    status: str
    triage_severity: Severity
    action_taken: str
    appointment_scheduled: bool = False
    appointment_details: Optional[TimeSlot] = None
    forms_sent: bool = False
    message: str


# ─── Platform Bridge Schemas ─────────────────────────────────────────────────
# These match the TS TriageRequest / TriageOutcome in packages/shared/ so
# the Next.js People API platform can delegate to this Python doctor agent.

class PlatformAnomalyMetrics(BaseModel):
    sleep_hours: Optional[float] = None
    resting_hr_bpm: Optional[float] = None
    steps: Optional[int] = None
    hrv_ms: Optional[float] = None


class PlatformAnomalyBaseline(BaseModel):
    sleep_mean: Optional[float] = None
    sleep_std: Optional[float] = None
    rhr_mean: Optional[float] = None
    rhr_std: Optional[float] = None
    steps_mean: Optional[float] = None
    steps_std: Optional[float] = None


class PlatformAnomaly(BaseModel):
    """Mirrors HealthAnomalyAlertSchema from packages/shared/src/schemas/health.ts"""
    user_handle: str
    date: str
    baseline_window_days: int
    metrics: PlatformAnomalyMetrics
    baseline: PlatformAnomalyBaseline
    flags: List[str]
    anomaly_score: int = Field(ge=0, le=100)
    freeform_context: Optional[str] = None


class PlatformTriageRequest(BaseModel):
    """Mirrors TriageRequestSchema from packages/shared/src/schemas/triage.ts"""
    patient_handle: str
    anomaly: PlatformAnomaly
    patient_answers: Optional[dict[str, str]] = None
    urgency: Literal["routine", "soon", "urgent"]
    message: str


class PlatformTriageOutcome(BaseModel):
    """Mirrors TriageOutcomeSchema from packages/shared/src/schemas/triage.ts"""
    intake_questions_asked: List[str]
    intake_answers: dict[str, str]
    urgency: Literal["routine", "soon", "urgent"]
    proposed_slots: List[dict]  # [{start: str, end: str}]
    booking_confirmation: dict   # {start: str, end: str, method: "telehealth"|"in_person"}
    escalation_triggered: bool
    calendar_event_id: Optional[str] = None  # Google Calendar event ID if created
