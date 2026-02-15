# 30-second verification (run from repo root)
import os, json, datetime as dt
from zoneinfo import ZoneInfo
from google.oauth2 import service_account
from googleapiclient.discovery import build

PACIFIC = ZoneInfo("America/Los_Angeles")

def to_pst(iso_str):
    d = dt.datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
    return d.astimezone(PACIFIC).strftime("%a %b %d at %I:%M %p Pacific")

os.chdir("Doctor_Agent_for_TreeHacks")
creds = service_account.Credentials.from_service_account_file(
    "../credentials/service_account.json",
    scopes=["https://www.googleapis.com/auth/calendar"],
)
svc = build("calendar", "v3", credentials=creds)
cal = os.environ.get("DOCTOR_CALENDAR_ID", "chimorty@gmail.com")

# Feb 16 00:00 UTC to Feb 20 23:59 UTC
time_min = "2026-02-16T00:00:00Z"
time_max = "2026-02-20T23:59:59Z"

# Free/busy for the range
res = svc.freebusy().query(body={
    "timeMin": time_min,
    "timeMax": time_max,
    "items": [{"id": cal}],
}).execute()
print("busy:", res["calendars"][cal]["busy"])

# List events with details
events_res = svc.events().list(
    calendarId=cal,
    timeMin=time_min,
    timeMax=time_max,
    singleEvents=True,
    orderBy="startTime",
).execute()
events = events_res.get("items", [])
print("\nEvents (Feb 16 - Feb 20) [before write test] (times in Pacific):")
for e in events:
    start = e["start"].get("dateTime", e["start"].get("date", "?"))
    end = e["end"].get("dateTime", e["end"].get("date", "?"))
    start_pst = to_pst(start) if start != "?" else "?"
    end_pst = to_pst(end) if end != "?" else "?"
    print(f"  - {e.get('summary', '(no title)')}: {start_pst} -> {end_pst}")

# --- Write test: create a test event in real time ---
test_start = "2026-02-20T14:00:00Z"
test_end = "2026-02-20T14:30:00Z"
test_event = {
    "summary": "Doctor Agent write test",
    "description": "Created by verify_calendar.py to test calendar write access.",
    "start": {"dateTime": test_start, "timeZone": "UTC"},
    "end": {"dateTime": test_end, "timeZone": "UTC"},
}
created = svc.events().insert(calendarId=cal, body=test_event).execute()
print(f"\n[WRITE TEST] Created event: {created.get('summary')}")
print(f"  id: {created.get('id')}")
print(f"  start: {test_start} -> end: {test_end}")
print(f"  link: {created.get('htmlLink', 'N/A')}")

# Verify: list events again and show the new one
events_res2 = svc.events().list(
    calendarId=cal,
    timeMin=time_min,
    timeMax=time_max,
    singleEvents=True,
    orderBy="startTime",
).execute()
events_after = events_res2.get("items", [])
print("\nEvents (Feb 16 - Feb 20) [after write test] (times in Pacific):")
for e in events_after:
    start = e["start"].get("dateTime", e["start"].get("date", "?"))
    end = e["end"].get("dateTime", e["end"].get("date", "?"))
    start_pst = to_pst(start) if start != "?" else "?"
    end_pst = to_pst(end) if end != "?" else "?"
    print(f"  - {e.get('summary', '(no title)')}: {start_pst} -> {end_pst}")

