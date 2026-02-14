# 🏥 Doctor Agent

An agentic health alert processing system for Stanford TreeHacks 2026.

Built for the **Healthcare** and **Human Flourishing** tracks.

## What it does

1. **Receives** a health alert from a patient wearable (Apple Watch, continuous monitor, etc.)
2. **Triages** it using Claude — classifying severity, appointment type, and urgency
3. **Escalates** immediately if critical (life-threatening)
4. **Negotiates** an appointment time in a fully automated, **agent-to-agent** conversation between the doctor's agent and the patient's agent
5. **Sends** relevant intake forms to the patient

```
Patient Device ──POST /alert──► Doctor Agent (Claude + LangGraph)
                                       │
                              ┌────────┴──────────┐
                              │     TRIAGE        │
                              │  severity: HIGH    │
                              │  type: Cardiac     │
                              └────────┬──────────┘
                                       │
                              ┌────────▼──────────┐
                              │ SCHEDULING AGENT  │
                              │  propose slots    │
                              └────────┬──────────┘
                                       │
                              POST proposal to patient_agent_url
                                       │
                              ◄────────┘ Patient agent responds
                              (agent-to-agent negotiation loop)
                                       │
                              ┌────────▼──────────┐
                              │ CALENDAR EVENT    │
                              │ created for both  │
                              └───────────────────┘
```

## Prize Targets 🏆

| Track | Sponsor | How |
|---|---|---|
| Healthcare | OpenEvidence | Primary use case |
| Human Flourishing | Anthropic | Claude as core LLM |
| Cloud AI | Google | Google Calendar integration |
| Inference | Modal | Deploy on Modal |
| Most Technically Complex | — | Agent-to-agent scheduling protocol |

## Quickstart

```bash
# Install
pip install -r requirements.txt

# Configure
cp .env.example .env
# Edit .env: add ANTHROPIC_API_KEY at minimum

# Run
uvicorn api.main:app --reload

# Test (in another terminal)
python tests/test_agent.py
```

## API

`POST /alert` — send a health alert
```json
{
  "patient_id": "pt_001",
  "patient_name": "Jane Doe",
  "patient_email": "jane@example.com",
  "alert_type": "elevated_heart_rate",
  "metric_value": 142,
  "metric_unit": "bpm",
  "threshold_value": 100,
  "description": "Resting heart rate 142 bpm detected",
  "patient_agent_url": "https://patient-agent.example.com/schedule",
  "timestamp": "2026-02-14T10:00:00"
}
```

`GET /alert/{session_id}/status` — poll processing status

`POST /schedule/response` — patient agent posts scheduling responses here

## Project Structure

```
Doctor_Agent_for_TreeHacks/
├── api/
│   ├── __init__.py
│   ├── main.py          # FastAPI app entry point
│   └── routes.py        # Endpoints (/alert, /schedule/response, /triage/platform)
├── agents/
│   ├── __init__.py
│   ├── triage.py        # LangGraph triage agent (Claude tool calling)
│   ├── scheduler.py     # Agent-to-agent scheduling negotiation
│   └── forms.py         # Intake forms dispatch
├── models/
│   ├── __init__.py
│   └── schemas.py       # All Pydantic models + platform bridge schemas
├── tools/
│   ├── __init__.py
│   └── calendar.py      # Google Calendar integration (real + mock fallback)
├── prompts/
│   └── triage_prompt.txt
├── tests/
│   ├── __init__.py
│   └── test_agent.py
├── config.py
├── requirements.txt
├── .env.example
└── GOOGLE_SETUP.md      # Google Calendar credentials guide
```

## Integration with People API Platform

The Doctor Agent runs as a standalone Python microservice (port 8000) and integrates with
the TS/Next.js People API platform via the `/triage/platform` bridge endpoint:

```
Next.js Platform                    Python Doctor Agent
    │                                       │
    │  POST /triage/platform ──────────────►│
    │  (TriageRequest from shared schema)   │
    │                                       │
    │                          Claude + LangGraph triage
    │                          Google Calendar freebusy
    │                                       │
    │◄── TriageOutcome ─────────────────────│
    │  (same shared schema)                 │
```

Set `DOCTOR_AGENT_URL=http://localhost:8000` in the Next.js `.env` to enable delegation.

## Google Calendar Setup

See `GOOGLE_SETUP.md` for step-by-step instructions.
The scheduler runs on mock data until credentials are configured.
