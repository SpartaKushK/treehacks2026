import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# Doctor Agent project root (directory containing config.py)
_PROJECT_ROOT = Path(__file__).resolve().parent

# ─── Anthropic ────────────────────────────────────────────────────────────────
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
CLAUDE_MODEL = "claude-sonnet-4-5-20250929"

# ─── Doctor Identity ──────────────────────────────────────────────────────────
DOCTOR_NAME = os.environ.get("DOCTOR_NAME", "Dr. Sarah Chen")
DOCTOR_ID = os.environ.get("DOCTOR_ID", "dr_001")
DOCTOR_EMAIL = os.environ.get("DOCTOR_EMAIL", "dr.chen@clinic.com")

# Google Calendar ID for the doctor. With a service account this must be the
# calendar ID you shared with the service account (e.g. your Gmail address or
# the calendar ID from Google Calendar settings).
DOCTOR_CALENDAR_ID = os.environ.get("DOCTOR_CALENDAR_ID", DOCTOR_EMAIL)

# ─── Google Calendar / OAuth ──────────────────────────────────────────────────
# Option A: Service account — no user sign-in. Share the doctor's calendar with
# the service account email (see GOOGLE_SETUP.md). Path can be relative to this project.
_raw_path = os.environ.get(
    "GOOGLE_SERVICE_ACCOUNT_FILE", "credentials/service_account.json"
)
GOOGLE_SERVICE_ACCOUNT_FILE = (
    str(_PROJECT_ROOT / _raw_path) if not os.path.isabs(_raw_path) else _raw_path
)
# Option B: OAuth refresh token — doctor signs in once (e.g. via Next.js "Connect
# Google Calendar"); save the refresh_token here. Agent uses it forever (no sign-in again).
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REFRESH_TOKEN = os.environ.get("GOOGLE_REFRESH_TOKEN", "")
# OAuth client secrets file (for patient calendar, when needed)
GOOGLE_OAUTH_CLIENT_SECRET_FILE = os.environ.get(
    "GOOGLE_OAUTH_CLIENT_SECRET_FILE", "credentials/oauth_client_secret.json"
)

# ─── Scheduling ───────────────────────────────────────────────────────────────
# How many days out to search for available slots
SCHEDULING_WINDOW_DAYS = 7
APPOINTMENT_DURATION_MINUTES = 60
MAX_SCHEDULING_ROUNDS = 3  # max back-and-forth rounds before fallback

# Working hours for the doctor (24h format)
DOCTOR_WORK_START_HOUR = 9    # 9 AM
DOCTOR_WORK_END_HOUR = 17     # 5 PM
DOCTOR_TIMEZONE = "America/Los_Angeles"

# ─── Email ────────────────────────────────────────────────────────────────────
SENDGRID_API_KEY = os.environ.get("SENDGRID_API_KEY", "")
FROM_EMAIL = os.environ.get("FROM_EMAIL", "noreply@clinic.com")

# ─── Agent Server ─────────────────────────────────────────────────────────────
# The base URL of THIS doctor agent server (used in callbacks to patient agent)
DOCTOR_AGENT_BASE_URL = os.environ.get(
    "DOCTOR_AGENT_BASE_URL", "http://localhost:8000")

# ─── Forms ────────────────────────────────────────────────────────────────────
# Map alert types to intake form URLs (replace with your actual Google Form links)
INTAKE_FORMS = {
    "elevated_heart_rate":      "https://forms.example.com/cardiac-symptoms",
    "irregular_cardiac_rhythm": "https://forms.example.com/afib-history",
    "low_blood_oxygen":         "https://forms.example.com/respiratory-symptoms",
    "fall_detected":            "https://forms.example.com/injury-assessment",
    "high_respiratory_rate":    "https://forms.example.com/respiratory-symptoms",
    "sleep_apnea_risk":         "https://forms.example.com/sleep-questionnaire",
    "chest_pain_reported":      "https://forms.example.com/chest-pain-intake",
    "high_blood_pressure":      "https://forms.example.com/bp-history",
    "low_blood_pressure":       "https://forms.example.com/bp-history",
    "glucose_spike":            "https://forms.example.com/glucose-tracking",
    "default":                  "https://forms.example.com/general-intake",
}
