# Google Cloud Setup Guide 🔑

This guide gets you a **Service Account** (for the doctor's calendar, server-side)
and **OAuth 2.0 credentials** (for patient calendar access, user-authorized).

You only need ~15 minutes for the first time setup.

---

## Part 1 — Create a Google Cloud Project

1. Go to https://console.cloud.google.com
2. Click the project dropdown at the top → **New Project**
3. Name it `doctor-agent` → **Create**
4. Make sure the new project is selected in the dropdown

---

## Part 2 — Enable the Google Calendar API

1. In the left sidebar → **APIs & Services** → **Library**
2. Search for `Google Calendar API`
3. Click it → **Enable**

---

## Part 3 — Service Account (Doctor's Calendar)

A service account lets your server access the doctor's calendar without
any user login flow. It's a machine identity.

### 3a. Create the service account

1. Left sidebar → **APIs & Services** → **Credentials**
2. Click **+ Create Credentials** → **Service Account**
3. Name: `doctor-agent-server`
4. Click **Create and Continue** → skip optional role → **Done**

### 3b. Download the JSON key

1. On the Credentials page, click the service account you just created
2. Go to the **Keys** tab
3. **Add Key** → **Create New Key** → **JSON** → **Create**
4. A JSON file will download. Move it into your project:

```bash
mkdir -p credentials
mv ~/Downloads/doctor-agent-server-*.json credentials/service_account.json
```

### 3c. Share the doctor's calendar with the service account

1. Open Google Calendar (calendar.google.com) as the doctor
2. On the left, find the calendar name → click the three dots → **Settings and sharing**
3. Scroll to **Share with specific people or groups**
4. Add the service account email (it looks like `doctor-agent-server@your-project.iam.gserviceaccount.com`)
   — you'll find it in the JSON file under `client_email`
5. Set permission to **Make changes to events** → **Send**

### 3d. Update your .env

```
DOCTOR_CALENDAR_ID=the-doctor@gmail.com   # or their Google Workspace email
GOOGLE_SERVICE_ACCOUNT_FILE=credentials/service_account.json
```

### 3e. Test the service account connection

```python
from google.oauth2 import service_account
from googleapiclient.discovery import build

SCOPES = ['https://www.googleapis.com/auth/calendar']
creds = service_account.Credentials.from_service_account_file(
    'credentials/service_account.json', scopes=SCOPES
)
service = build('calendar', 'v3', credentials=creds)

# Should print the doctor's upcoming events
events = service.events().list(calendarId='doctor@example.com', maxResults=5).execute()
print(events)
```

---

## Part 4 — OAuth 2.0 Client (Patient Calendar Access)

For patient calendar access, we need OAuth — the patient must authorize
your app to read their calendar. For the hackathon demo, you'll do this
once in a browser flow and store the token.

### 4a. Create OAuth credentials

1. **APIs & Services** → **Credentials** → **+ Create Credentials** → **OAuth client ID**
2. If prompted to configure consent screen:
   - **User Type**: External → **Create**
   - App name: `Doctor Agent`
   - Support email: your email
   - Click through the rest → **Save and Continue** (you can skip scopes for now)
   - Back on the consent screen page → **Publish App** (otherwise only test users work)
3. Back to creating OAuth client ID:
   - Application type: **Web application**
   - Name: `doctor-agent-web`
   - Authorized redirect URIs: add `http://localhost:8000/oauth/callback`
   - Click **Create**
4. Download the JSON → move to:

```bash
mv ~/Downloads/client_secret_*.json credentials/oauth_client_secret.json
```

### 4b. Run the one-time OAuth flow (for demo/dev)

```python
# Run this once to generate a token.json for the patient
from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = ['https://www.googleapis.com/auth/calendar.readonly']
flow = InstalledAppFlow.from_client_secrets_file(
    'credentials/oauth_client_secret.json', SCOPES
)
creds = flow.run_local_server(port=0)

# Save for reuse
import json
with open('credentials/patient_token.json', 'w') as f:
    f.write(creds.to_json())

print("Token saved!")
```

Run this script, it opens a browser, you log in as the test patient, authorize the app.

### 4c. Load the token in code

```python
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request

def load_patient_credentials(token_path: str) -> Credentials:
    creds = Credentials.from_authorized_user_file(token_path)
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
    return creds
```

---

## Part 5 — Add credentials to .gitignore

**CRITICAL:** Never commit these files to git.

```bash
echo "credentials/" >> .gitignore
echo ".env" >> .gitignore
```

---

## Part 6 — Verify Everything Works

```bash
# Install dependencies
pip install -r requirements.txt

# Copy env template
cp .env.example .env
# Edit .env with your ANTHROPIC_API_KEY and calendar details

# Run the server
uvicorn api.main:app --reload

# In another terminal, run the test
python tests/test_agent.py
```

You should see the triage agent run and print severity/appointment type.

---

## For the Hackathon Demo

If you don't have time to wire up full OAuth, the scheduler is currently
running with **mock calendar data** that still demonstrates the full
agent-to-agent negotiation protocol. You can demo the real triage + 
scheduling logic without live calendar access, then mention in your 
presentation that production would use real Google Calendar.

The Google Calendar API integration lives in `tools/calendar.py` (stub file).
Wire it up by calling `get_free_slots()` with the service account credentials.
