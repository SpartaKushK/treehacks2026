"""
Google Calendar Integration — Doctor Agent

Provides two capabilities:
  1. get_free_slots()  — query the doctor's calendar for available appointment windows
  2. create_event()    — book an appointment on the doctor's calendar

Supports two auth methods (no repeated sign-in):
  - OAuth refresh token: set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN
    (e.g. after the doctor connects once via the Next.js "Connect Google Calendar" flow).
  - Service account: set GOOGLE_SERVICE_ACCOUNT_FILE and share the doctor's calendar
    with the service account email. See GOOGLE_SETUP.md.
"""

import logging
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo

from models.schemas import TimeSlot
import config

# All user-facing times (labels, display) are in Pacific
PACIFIC = ZoneInfo(config.DOCTOR_TIMEZONE)  # America/Los_Angeles

logger = logging.getLogger(__name__)

# ─── Calendar API client (OAuth or Service Account) ────────────────────────────

_calendar_service = None
_oauth_creds = None  # Only set when using OAuth; used to refresh token when expired


def _get_calendar_service():
    """
    Lazily initialise the Google Calendar API client.
    Prefers OAuth refresh token (one-time sign-in, token saved in env) if set;
    otherwise uses service account (calendar shared with bot email = no sign-in).
    Returns None if credentials are missing or invalid.
    """
    global _calendar_service, _oauth_creds
    if _calendar_service is not None:
        return _calendar_service

    try:
        from google.oauth2.credentials import Credentials
        from google.auth.transport.requests import Request
        from googleapiclient.discovery import build

        SCOPES = ["https://www.googleapis.com/auth/calendar"]

        # Option 1: OAuth refresh token — doctor signed in once; we use saved token
        if (
            config.GOOGLE_CLIENT_ID
            and config.GOOGLE_CLIENT_SECRET
            and config.GOOGLE_REFRESH_TOKEN
        ):
            _oauth_creds = Credentials(
                token=None,
                refresh_token=config.GOOGLE_REFRESH_TOKEN,
                token_uri="https://oauth2.googleapis.com/token",
                client_id=config.GOOGLE_CLIENT_ID,
                client_secret=config.GOOGLE_CLIENT_SECRET,
                scopes=SCOPES,
            )
            _oauth_creds.refresh(Request())
            _calendar_service = build("calendar", "v3", credentials=_oauth_creds)
            logger.info("Google Calendar service initialised (OAuth refresh token).")
            return _calendar_service

        # Option 2: Service account — calendar shared with service account email
        if config.GOOGLE_SERVICE_ACCOUNT_FILE and os.path.isfile(
            config.GOOGLE_SERVICE_ACCOUNT_FILE
        ):
            from google.oauth2 import service_account
            creds = service_account.Credentials.from_service_account_file(
                config.GOOGLE_SERVICE_ACCOUNT_FILE, scopes=SCOPES
            )
            _calendar_service = build("calendar", "v3", credentials=creds)
            logger.info("Google Calendar service initialised (service account).")
            return _calendar_service

        logger.warning("Google Calendar: no GOOGLE_REFRESH_TOKEN or GOOGLE_SERVICE_ACCOUNT_FILE.")
        return None
    except Exception as e:
        logger.warning(f"Google Calendar unavailable, using mock data: {e}")
        return None


def _refresh_oauth_if_needed():
    """Refresh OAuth access token if expired (so doctor never has to sign in again)."""
    global _oauth_creds
    if _oauth_creds is not None and _oauth_creds.expired:
        from google.auth.transport.requests import Request
        _oauth_creds.refresh(Request())


# ─── Free / Busy Query ────────────────────────────────────────────────────────

def get_free_slots(
    urgency_hours: int,
    duration_minutes: int = config.APPOINTMENT_DURATION_MINUTES,
    max_slots: int = 5,
) -> list[TimeSlot]:
    """
    Return up to *max_slots* available appointment windows for the doctor.

    Uses the Google Calendar freebusy API when GOOGLE_SERVICE_ACCOUNT_FILE (or
    OAuth refresh token) is configured. When the service account JSON is set,
    only real calendar data is returned; no mock fallback.
    """
    _refresh_oauth_if_needed()
    service = _get_calendar_service()
    using_service_account = bool(
        config.GOOGLE_SERVICE_ACCOUNT_FILE and os.path.isfile(config.GOOGLE_SERVICE_ACCOUNT_FILE)
    )
    if service is None:
        if using_service_account:
            logger.error(
                "Google Calendar: service account file is set but calendar service failed to init. "
                "Check GOOGLE_SERVICE_ACCOUNT_FILE path and that the doctor's calendar is "
                "shared with the service account email."
            )
            return []
        return _mock_free_slots(urgency_hours, duration_minutes, max_slots)

    try:
        return _real_free_slots(service, urgency_hours, duration_minutes, max_slots)
    except Exception as e:
        logger.error(f"Calendar freebusy query failed: {e}")
        if using_service_account:
            raise
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

    # Generate candidate slots during doctor's working hours (9am-5pm Pacific)
    # Build times in Pacific so slots are 9am, 10am, ... 5pm local, not UTC
    slots: list[TimeSlot] = []
    day = time_min.date()
    end_date = time_max.date()

    while day <= end_date and len(slots) < max_slots:
        # Skip weekends
        if day.weekday() >= 5:
            day += timedelta(days=1)
            continue

        for hour in range(config.DOCTOR_WORK_START_HOUR, config.DOCTOR_WORK_END_HOUR):
            # Slot in doctor's timezone (Pacific), then convert to UTC for API/busy check
            slot_start_pacific = datetime(
                day.year, day.month, day.day, hour, 0,
                tzinfo=PACIFIC,
            )
            slot_start = slot_start_pacific.astimezone(timezone.utc)
            slot_end = slot_start + timedelta(minutes=duration_minutes)

            # Only include slots that start at or after time_min (don't offer past slots)
            if slot_start < time_min:
                continue

            # Check if this slot overlaps any busy period
            overlaps = any(
                not (slot_end <= bs or slot_start >= be) for bs, be in busy
            )
            if not overlaps:
                slots.append(TimeSlot(
                    start=slot_start,
                    end=slot_end,
                    label=slot_start_pacific.strftime("%A %B %d at %I:%M %p Pacific"),
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
    """Deterministic mock slots — used when Google Calendar is not configured. Uses 9am–5pm Pacific."""
    now_pacific = datetime.now(PACIFIC).replace(minute=0, second=0, microsecond=0)
    start_offset = max(1, urgency_hours // 8)
    slots: list[TimeSlot] = []

    for day_offset in range(start_offset, start_offset + config.SCHEDULING_WINDOW_DAYS):
        day = (now_pacific + timedelta(days=day_offset)).date()
        if day.weekday() >= 5:
            continue
        for hour in [9, 11, 14, 16]:
            slot_start_pacific = datetime(day.year, day.month, day.day, hour, 0, tzinfo=PACIFIC)
            slot_start = slot_start_pacific.astimezone(timezone.utc)
            slot_end = slot_start + timedelta(minutes=duration_minutes)
            slots.append(TimeSlot(
                start=slot_start,
                end=slot_end,
                label=slot_start_pacific.strftime("%A %B %d at %I:%M %p Pacific"),
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
    _refresh_oauth_if_needed()
    service = _get_calendar_service()
    if service is None:
        logger.info(
            f"[MOCK] Calendar event would be created: {appointment_type} with "
            f"{patient_name} at {slot.start}"
        )
        return "mock_event_id"

    try:
        # On the doctor's calendar: show "Medical Appointment with Pari", not "Medical Appointment with Dr. Smith — Pari"
        cleaned_type = re.sub(r"[\s—\-]+(with\s+)?Dr\.?\s*[\w\s]+$", "", appointment_type, flags=re.I).strip() or appointment_type
        summary_for_doctor = f"{cleaned_type} with {patient_name}"
        event_body = {
            "summary": summary_for_doctor,
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
