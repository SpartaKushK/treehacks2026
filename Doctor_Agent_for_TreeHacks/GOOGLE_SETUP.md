# Google Cloud Setup Guide 🔑

This guide gets you a **Service Account** (for the doctor's calendar, server-side)
and **OAuth 2.0 credentials** (for patient calendar access, user-authorized).

You only need ~15 minutes for the first time setup.

---

## Doctor calendar: no sign-in again

The Doctor Agent can access the doctor's Google Calendar **without the doctor signing in again**:

- **Option A — Service account (recommended):** Create a service account, download its JSON key, and **share the doctor's Google Calendar** with the service account email (Settings → Share with specific people → add the `client_email` from the JSON). The agent then has permanent access until you revoke the share. No login flow at all.
- **Option B — OAuth refresh token:** The doctor signs in once (e.g. via the Next.js app "Connect Google Calendar"). Your app receives a `refresh_token`; save it in the Doctor Agent `.env` as `GOOGLE_REFRESH_TOKEN` (with `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`). The agent uses that token forever to get new access tokens; the doctor never has to sign in again.

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

## Part 3b — Option B: OAuth refresh token (doctor signs in once)

If you prefer not to use a service account, the doctor can sign in once and you save the refresh token:

1. Use the **same** OAuth client as the Next.js app (Part 4 below): create OAuth client ID (Desktop or Web), get Client ID and Client Secret.
2. Have the doctor complete the Google sign-in once (e.g. in the Next.js dashboard: **Connect Google Calendar**). The app will store `refresh_token` in the database (e.g. `Human.googleCalendarTokens` for the doctor user).
3. Copy the refresh token into the Doctor Agent `.env`:
   - From the DB: query the doctor’s `googleCalendarTokens` JSON and copy the `refresh_token` value.
   - Or run a one-time OAuth script that prints the refresh token after the doctor signs in.
4. Set in Doctor Agent `.env`:
   ```
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-your-secret
   GOOGLE_REFRESH_TOKEN=1//0abc...paste-here
   DOCTOR_CALENDAR_ID=primary
   ```
   (Use `primary` for the default calendar, or the doctor’s email.)
5. The Doctor Agent will use this token to get new access tokens when needed; the doctor never has to sign in again.

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

## Part 7 — Next.js Web App (OAuth for Dashboard Calendar)

The Next.js dashboard has a "Connect Google Calendar" button that lets
the doctor view/sync their calendar in the web UI. This uses OAuth 2.0
(separate from the service account).

### 7a. Create OAuth 2.0 credentials for the web app

1. In GCP Console -> **APIs & Services** -> **Credentials**
2. Click **+ Create Credentials** -> **OAuth client ID**
3. Application type: **Web application**
4. Name: `people-api-web`
5. Authorized redirect URIs: add `http://localhost:3000/api/google/callback`
6. Click **Create**
7. Copy the **Client ID** and **Client Secret**

### 7b. Update `apps/web/.env.local`

```
GOOGLE_CLIENT_ID=<your-client-id>.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-<your-secret>
GOOGLE_REDIRECT_URI=http://localhost:3000/api/google/callback
```

### 7c. Test

1. Start the Next.js dev server: `cd apps/web && pnpm dev`
2. Navigate to your agent config page: `http://localhost:3000/dashboard/agents/<handle>`
3. Expand Settings -> click **Connect Google Calendar**
4. Log in with the doctor's Google account, authorize
5. You should be redirected back with `?calendar=connected`

---

## Quick Start for Your New Doctor Google Account

Your service account email is:
```
doctor-agent-server@treehacks2026.iam.gserviceaccount.com
```

Steps to get calendar events appearing:

1. **Enable Google Calendar API** (if not already):
   - Go to https://console.cloud.google.com/apis/library/calendar-json.googleapis.com
   - Select project `treehacks2026` -> **Enable**

2. **Share the doctor's calendar with the service account**:
   - Log into Google Calendar as the new doctor account
   - Settings gear -> Settings -> left sidebar -> your calendar
   - "Share with specific people or groups" -> **+ Add people and groups**
   - Enter: `doctor-agent-server@treehacks2026.iam.gserviceaccount.com`
   - Permission: **Make changes to events** -> **Send**

3. **Update `Doctor_Agent_for_TreeHacks/.env`**:
   ```
   DOCTOR_EMAIL=<new-doctor-email>@gmail.com
   DOCTOR_CALENDAR_ID=<new-doctor-email>@gmail.com
   ```

4. **Restart the Doctor Agent**: `python run.py`

5. **Test**: Run the demo pipeline — the triage should now create a real
   Google Calendar event on the doctor's calendar instead of a mock event.

---

## For the Hackathon Demo

With the service account set up, the full pipeline works end-to-end:
1. Anomaly detected -> Patient agent analyzes
2. Doctor Agent triages via Claude + LangGraph
3. Doctor Agent checks real calendar for free slots
4. Doctor Agent creates a Google Calendar event
5. Event shows up on the doctor's actual calendar

The `_triage_source` field in the API response confirms the Python Doctor
Agent handled the triage. The `calendar_event_id` field confirms a real
Google Calendar event was created.
