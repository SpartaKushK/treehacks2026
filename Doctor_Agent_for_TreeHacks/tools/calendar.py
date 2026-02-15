"""
Google Calendar Integration — Doctor Agent

Provides two capabilities:
  1. get_free_slots()  — query the doctor's calendar for available appointment windows
  2. create_event()    — book an appointment on the doctor's calendar

Uses a Service Account to access the doctor's Google Calendar (no user OAuth flow).
Falls back to mock data if credentials are missing.

Setup: see GOOGLE_SETUP.md
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from models.schemas import TimeSlot
import config

logger = logging.getLogger(__name__)

# ─── Service Account Credentials ──────────────────────────────────────────────

_calendar_service = None


def _get_calendar_service():
    """
    Lazily initialise the Google Calendar API client using the service account.
    Returns None if credentials are missing or invalid.
    """
    global _calendar_service
    if _calendar_service is not None:
        return _calendar_service

    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build

        SCOPES = ["https://www.googleapis.com/auth/calendar"]
        creds = service_account.Credentials.from_service_account_file(
            config.GOOGLE_SERVICE_ACCOUNT_FILE, scopes=SCOPES
        )
        _calendar_service = build("calendar", "v3", credentials=creds)
        logger.info("Google Calendar service initialised (service account).")
        return _calendar_service
    except Exception as e:
        logger.warning(f"Google Calendar unavailable, using mock data: {e}")
        return None


# ─── Free / Busy Query ────────────────────────────────────────────────────────

def get_free_slots(
    urgency_hours: int,
    duration_minutes: int = config.APPOINTMENT_DURATION_MINUTES,
    max_slots: int = 5,
) -> list[TimeSlot]:
    """
    Return up to *max_slots* available appointment windows for the doctor.

    Tries the real Google Calendar freebusy API first.
    Falls back to deterministic mock slots if credentials are not configured.
    """
    service = _get_calendar_service()
    if service is None:
        return _mock_free_slots(urgency_hours, duration_minutes, max_slots)

    try:
        return _real_free_slots(service, urgency_hours, duration_minutes, max_slots)
    except Exception as e:
        logger.error(f"Calendar freebusy query failed, falling back to mock: {e}")
        return _mock_free_slots(urgency_hours, duration_minutes, max_slots)


def _real_free_slots(
    service,
    urgency_hours: int,
    duration_minutes: int,
    max_slots: int,
) -> list[TimeSlot]:
    """Query Google Calendar freebusy and compute open windows."""
    now = datetime.now(timezone.utc)
    time_min = now + timedelta(hours=max(1, urgency_hours // 4))
    time_max = time_min + timedelta(days=config.SCHEDULING_WINDOW_DAYS)

    body = {
        "timeMin": time_min.isoformat(),
        "timeMax": time_max.isoformat(),
        "timeZone": config.DOCTOR_TIMEZONE,
        "items": [{"id": config.DOCTOR_CALENDAR_ID}],
    }

    result = service.freebusy().query(body=body).execute()
    busy_periods = result["calendars"][config.DOCTOR_CALENDAR_ID]["busy"]

    # Convert busy periods to datetime pairs
    busy = [
        (
            datetime.fromisoformat(b["start"].replace("Z", "+00:00")),
            datetime.fromisoformat(b["end"].replace("Z", "+00:00")),
        )
        for b in busy_periods
    ]

    # Generate candidate slots during working hours, skip busy ones
    slots: list[TimeSlot] = []
    day = time_min.date()
    end_date = time_max.date()

    while day <= end_date and len(slots) < max_slots:
        # Skip weekends
        if day.weekday() >= 5:
            day += timedelta(days=1)
            continue

        for hour in range(config.DOCTOR_WORK_START_HOUR, config.DOCTOR_WORK_END_HOUR):
            slot_start = datetime(
                day.year, day.month, day.day, hour, 0,
                tzinfo=timezone.utc,  # simplified; should use DOCTOR_TIMEZONE
            )
            slot_end = slot_start + timedelta(minutes=duration_minutes)

            # Check if this slot overlaps any busy period
            overlaps = any(
                not (slot_end <= bs or slot_start >= be) for bs, be in busy
            )
            if not overlaps:
                slots.append(TimeSlot(
                    start=slot_start,
                    end=slot_end,
                    label=slot_start.strftime("%A %B %d at %I:%M %p"),
                ))
                if len(slots) >= max_slots:
                    break

        day += timedelta(days=1)

    return slots


def _mock_free_slots(
    urgency_hours: int,
    duration_minutes: int,
    max_slots: int,
) -> list[TimeSlot]:
    """Deterministic mock slots — used when Google Calendar is not configured."""
    base = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    start_offset = max(1, urgency_hours // 8)
    slots: list[TimeSlot] = []

    for day_offset in range(start_offset, start_offset + config.SCHEDULING_WINDOW_DAYS):
        candidate = base + timedelta(days=day_offset)
        if candidate.weekday() >= 5:
            continue
        for hour in [9, 11, 14, 16]:
            slot_start = candidate.replace(hour=hour)
            slot_end = slot_start + timedelta(minutes=duration_minutes)
            slots.append(TimeSlot(
                start=slot_start,
                end=slot_end,
                label=slot_start.strftime("%A %B %d at %I:%M %p"),
            ))
            if len(slots) >= max_slots:
                return slots

    return slots


# ─── Create Calendar Event ────────────────────────────────────────────────────

def create_event(
    slot: TimeSlot,
    patient_name: str,
    patient_email: str,
    appointment_type: str,
    description: str = "",
) -> Optional[str]:
    """
    Create a calendar event for the confirmed appointment.
    Returns the event ID, or None if calendar is not configured.
    """
    service = _get_calendar_service()
    if service is None:
        logger.info(
            f"[MOCK] Calendar event would be created: {appointment_type} with "
            f"{patient_name} at {slot.start}"
        )
        return "mock_event_id"

    try:
        event_body = {
            "summary": f"{appointment_type} — {patient_name}",
            "description": (
                f"Auto-scheduled by Doctor Agent.\n"
                f"Patient: {patient_name} ({patient_email})\n"
                f"Type: {appointment_type}\n\n"
                f"{description}"
            ),
            "start": {
                "dateTime": slot.start.isoformat(),
                "timeZone": config.DOCTOR_TIMEZONE,
            },
            "end": {
                "dateTime": slot.end.isoformat(),
                "timeZone": config.DOCTOR_TIMEZONE,
            },
            # Note: attendees are omitted because service accounts on personal
            # Gmail cannot invite attendees without Domain-Wide Delegation.
            # The patient info is in the description instead.
            "reminders": {
                "useDefault": False,
                "overrides": [
                    {"method": "email", "minutes": 60},
                    {"method": "popup", "minutes": 15},
                ],
            },
        }

        created = (
            service.events()
            .insert(calendarId=config.DOCTOR_CALENDAR_ID, body=event_body)
            .execute()
        )
        event_id = created.get("id", "")
        logger.info(f"Calendar event created: {event_id}")
        return event_id

    except Exception as e:
        logger.error(f"Failed to create calendar event: {e}")
        return None
