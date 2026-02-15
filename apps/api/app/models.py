"""Pydantic models replacing Zod schemas from packages/shared."""

from __future__ import annotations

from typing import Any, Literal
from pydantic import BaseModel, Field


# ── Registry ──

class RegisterBody(BaseModel):
    handle: str = Field(min_length=1)
    endpoint_url: str = Field(alias="endpointUrl")
    public_key: str = Field(min_length=1, alias="publicKey")
    display_name: str = Field(min_length=1, alias="displayName")

    model_config = {"populate_by_name": True}


# ── Invoke ──

class InvokePayload(BaseModel):
    capability: str = Field(min_length=1)
    scopes: list[str]
    input: Any
    nonce: str = Field(min_length=1)
    timestamp: int


# ── Scheduling ──

class TimeSlot(BaseModel):
    start: str
    end: str


class ScheduleProposeInput(BaseModel):
    title: str
    duration_mins: int = Field(gt=0, alias="durationMins")
    time_window: TimeSlot = Field(alias="timeWindow")
    location_prefs: list[str] = Field(default_factory=list, alias="locationPrefs")

    model_config = {"populate_by_name": True}


class ScheduleConfirmInput(BaseModel):
    chosen_slot: TimeSlot = Field(alias="chosenSlot")
    title: str
    participants: list[str]

    model_config = {"populate_by_name": True}


# ── Health ──

class HealthSummaryOutput(BaseModel):
    range_days: int = Field(alias="rangeDays")
    sleep: dict[str, Any]
    activity: dict[str, Any]
    medication: dict[str, Any]
    symptoms: dict[str, Any]
    notes: list[str]
    patient_friendly_text: str | None = Field(default=None, alias="patientFriendlyText")

    model_config = {"populate_by_name": True}


# ── Health Anomaly ──

class AnomalyMetrics(BaseModel):
    sleep_hours: float | None = None
    resting_hr_bpm: float | None = None
    steps: float | None = None
    hrv_ms: float | None = None


class AnomalyBaseline(BaseModel):
    sleep_mean: float | None = None
    sleep_std: float | None = None
    rhr_mean: float | None = None
    rhr_std: float | None = None
    steps_mean: float | None = None
    steps_std: float | None = None


class HealthAnomalyAlert(BaseModel):
    user_handle: str
    date: str
    baseline_window_days: int
    metrics: AnomalyMetrics
    baseline: AnomalyBaseline
    flags: list[str]
    anomaly_score: int = Field(ge=0, le=100)
    freeform_context: str | None = None


# ── Patient Decision ──

class PatientDecision(BaseModel):
    summary_explanation: str
    questions: list[str]
    recommended_next_step: str
    should_contact_clinic: bool
    urgency: Literal["routine", "soon", "urgent"]
    clinic_message: str | None = None


# ── Triage ──

class TriageRequest(BaseModel):
    patient_handle: str
    anomaly: HealthAnomalyAlert
    patient_answers: dict[str, str] | None = None
    urgency: Literal["routine", "soon", "urgent"]
    message: str


class BookingConfirmation(BaseModel):
    start: str
    end: str
    method: Literal["telehealth", "in_person"]


class TriageOutcome(BaseModel):
    intake_questions_asked: list[str]
    intake_answers: dict[str, str]
    urgency: Literal["routine", "soon", "urgent"]
    proposed_slots: list[TimeSlot]
    booking_confirmation: BookingConfirmation
    escalation_triggered: bool
    calendar_event_id: str | None = None


# ── Planner output ──

class PlannerOutput(BaseModel):
    action: Literal["propose", "counter", "confirm"]
    args: Any
    message: str


# ── Health Data (iOS upload) ──

class StepEntry(BaseModel):
    date: str
    step_count: int = Field(alias="stepCount")
    model_config = {"populate_by_name": True}


class HeartRateEntry(BaseModel):
    start_date: str = Field(alias="startDate")
    end_date: str = Field(alias="endDate")
    bpm: float
    model_config = {"populate_by_name": True}


class SleepSample(BaseModel):
    start_date: str = Field(alias="startDate")
    end_date: str = Field(alias="endDate")
    sleep_stage: str = Field(alias="sleepStage")
    model_config = {"populate_by_name": True}


class ActiveEnergyEntry(BaseModel):
    date: str
    kilocalories: float


class DistanceEntry(BaseModel):
    date: str
    distance_meters: float = Field(alias="distanceMeters")
    model_config = {"populate_by_name": True}


class WorkoutEntry(BaseModel):
    start_date: str = Field(alias="startDate")
    end_date: str = Field(alias="endDate")
    activity_type: str = Field(alias="activityType")
    duration_seconds: float = Field(alias="durationSeconds")
    total_energy_kcal: float | None = Field(default=None, alias="totalEnergyKcal")
    total_distance_meters: float | None = Field(default=None, alias="totalDistanceMeters")
    model_config = {"populate_by_name": True}


class WeightEntry(BaseModel):
    date: str
    weight_kg: float = Field(alias="weightKg")
    model_config = {"populate_by_name": True}


class HeightEntry(BaseModel):
    date: str
    height_cm: float = Field(alias="heightCm")
    model_config = {"populate_by_name": True}


class HealthEventEntry(BaseModel):
    event_type: str = Field(alias="eventType")
    start_date: str = Field(alias="startDate")
    end_date: str = Field(alias="endDate")
    model_config = {"populate_by_name": True}


class HealthDataPayload(BaseModel):
    export_date: str = Field(alias="exportDate")
    steps: list[StepEntry] = []
    heart_rates: list[HeartRateEntry] = Field(default=[], alias="heartRates")
    sleep_samples: list[SleepSample] = Field(default=[], alias="sleepSamples")
    active_energy: list[ActiveEnergyEntry] = Field(default=[], alias="activeEnergy")
    distances: list[DistanceEntry] = []
    workouts: list[WorkoutEntry] = []
    weights: list[WeightEntry] = []
    heights: list[HeightEntry] = []
    health_events: list[HealthEventEntry] = Field(default=[], alias="healthEvents")
    device_id: str | None = Field(default=None, alias="deviceId")

    model_config = {"populate_by_name": True}
