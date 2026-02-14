# People API — Design Document

**TreeHacks 2026 | Agent-to-Agent Human Endpoints**

---

## Overview

People API gives every human a canonical agent endpoint (`/u/:handle`) so AI agents can discover, authenticate, and invoke capabilities on their behalf. The system demonstrates cryptographically signed multi-agent orchestration across scheduling, healthcare analytics, and real-time health anomaly triage.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Next.js (Frontend)                │
│         App Router  /  React  /  TailwindCSS        │
│                                                     │
│  Dashboard    Demo UI    Trace Viewer    Agent Cards │
└──────────────────────┬──────────────────────────────┘
                       │ fetch / REST
┌──────────────────────▼──────────────────────────────┐
│                  FastAPI (Backend)                   │
│                                                     │
│  /registry/*        Agent registration & lookup     │
│  /u/:handle/invoke  Signed capability invocation    │
│  /u/:handle/caps    Capability & policy discovery   │
│  /demo/*            Orchestrated demo flows         │
│  /anomaly/*         Alert management                │
│  /calendar/*        Google Calendar sync            │
└──────────┬────────────────────┬─────────────────────┘
           │                    │
    ┌──────▼──────┐      ┌──────▼──────┐
    │  Supabase   │      │  LLM APIs   │
    │  (Postgres) │      │             │
    │             │      │  OpenAI     │
    │  humans     │      │  GPT-4o    │
    │  capabilit. │      │             │
    │  policies   │      │  Anthropic  │
    │  bookings   │      │  Claude     │
    │  traces     │      │  Sonnet    │
    │  health_*   │      │             │
    │  anomaly_*  │      └─────────────┘
    │  calendar   │
    └─────────────┘
```

---

## Tech Stack

| Layer | Technology | Role |
|-------|-----------|------|
| Frontend | **Next.js 14** (App Router) | Dashboard UI, demo pages, React components |
| Backend | **FastAPI** (Python) | REST API, capability routing, policy engine, crypto |
| Database | **Supabase** (Postgres) | Persistent storage, row-level security, real-time subscriptions |
| Auth | **Clerk** | User identity, session management |
| Crypto | **Ed25519** (tweetnacl) | Request signing & verification |
| LLM | **OpenAI** GPT-4o / **Claude** Sonnet | Scheduling planner, health explanations, triage |
| Validation | **Zod** + **Pydantic** | Schema enforcement on both layers |
| Monorepo | **pnpm workspaces** | Shared types between frontend & backend |

---

## Data Models (Supabase / Postgres)

### `humans`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid PK | |
| handle | text UNIQUE | `"pari"`, `"alex"`, `"dr_smith"` |
| display_name | text | |
| public_key | text | Hex Ed25519 public key |
| endpoint_url | text | `/api/u/:handle` |
| persona_prompt | text? | LLM persona override |
| llm_provider | text | `"openai"` or `"claude"` |
| anomaly_threshold | jsonb | `{"urgent": 85, "soon": 70}` |

### `capabilities`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid PK | |
| human_id | uuid FK | |
| name | text | `"schedule_propose"`, `"health.anomaly_alert"` |
| description | text | |

### `policies`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid PK | |
| human_id | uuid FK | |
| capability_name | text | |
| allowed_callers | jsonb | `["pari"]` or `["*"]` |
| required_scopes | jsonb | `["premium"]`, `["triage:write"]` |
| payment_required | bool | |
| price_cents | int | e.g. 500 = $5.00 |

### `bookings`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid PK | |
| from_handle | text | Caller |
| to_handle | text | Callee |
| start_ts / end_ts | timestamptz | |
| title | text | |

### `traces`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid PK | |
| provider | text | `"openai"` or `"claude"` |
| steps_json | jsonb | Array of `TraceStep` |

### `health_metrics`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid PK | |
| human_id | uuid FK | |
| date | date | |
| sleep_hours | float | |
| steps | int | |
| med_adherence | bool | |
| symptom_score | float | 1-10 |

### `anomaly_alerts`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid PK | |
| human_id | uuid FK | |
| trace_id | uuid? | |
| severity | text | `"routine"`, `"soon"`, `"urgent"` |
| anomaly_score | int | 0-100 |
| flags | jsonb | `["SLEEP_DROP", "RHR_SPIKE"]` |
| decision | jsonb | PatientDecision |
| triage_outcome | jsonb? | TriageOutcome (if escalated) |
| status | text | `"active"` or `"resolved"` |

---

## API Endpoints (FastAPI)

### Registry
| Method | Path | Description |
|--------|------|-------------|
| POST | `/registry/register` | Register human agent |
| GET | `/registry/lookup/{handle}` | Lookup by handle |

### Agent Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/u/{handle}/caps` | List capabilities & policies |
| POST | `/u/{handle}/invoke` | Invoke capability (signed) |

### Demo Orchestration
| Method | Path | Description |
|--------|------|-------------|
| POST | `/demo/schedule` | 3-turn scheduling negotiation |
| GET | `/demo/health` | Health summary + LLM explanation |
| GET | `/demo/anomaly` | Health anomaly triage pipeline |
| GET | `/demo/trace/{traceId}` | Retrieve full trace |
| POST | `/demo/seed` | Re-seed database |

### Anomaly Management
| Method | Path | Description |
|--------|------|-------------|
| GET | `/anomaly/live` | Active alerts |
| GET | `/anomaly/history` | Resolved alerts |
| POST | `/anomaly/{id}/resolve` | Resolve alert |

---

## Core Flows

### 1. Scheduling Negotiation (3-turn)

```
Pari                    Orchestrator                  Alex
 │                           │                          │
 │  sign(schedule_propose) ──>│── verify + policy ──────>│
 │                           │<── proposed slots ────────│
 │                           │                          │
 │  sign(schedule_counter) ──>│── verify + policy ──────>│
 │                           │<── accepted slot ─────────│
 │                           │                          │
 │  sign(schedule_confirm) ──>│── create booking ───────>│
 │<── booking confirmed ──────│                          │
```

- Ed25519 signed payloads with nonce + 5-min timestamp window
- LLM selects optimal slot from availability gaps
- Deterministic fallback if no API key

### 2. Health Summary (Payment-Gated)

```
Dr. Smith ── invoke(health_summary, scopes=["premium"]) ──> Pari
         <── 402 Payment Required (if no premium scope) ────
         ── pay $5.00 + re-invoke ──>
         <── 30-day health analytics + LLM explanation ─────
```

- Policy requires `premium` scope + payment ($5.00)
- Computes 30-day aggregates: sleep, steps, medication adherence, symptoms
- LLM generates patient-friendly explanation

### 3. Health Anomaly Triage Pipeline

```
Wearable ──> Pari Agent ──> LLM (Patient Decision) ──> Escalate? ──> Dr. Smith
                                                              │
                              ┌────────────────────────────────┘
                              ▼
                   Doctor Receptionist LLM
                     │  Intake Q&A (2 turns)
                     │  Propose appointment slots
                     │  Book appointment
                     ▼
                   TriageOutcome returned to patient
```

- Wearable data: sleep, resting HR, steps, HRV + baseline stats
- Anomaly score 0-100; flags: `SLEEP_DROP`, `RHR_SPIKE`, `STEPS_DROP`, `HRV_DROP`
- Patient LLM decides urgency + whether to contact clinic
- If `should_contact_clinic`: auto-escalate to `dr_smith` via `triage.intake_and_schedule`
- Doctor receptionist runs intake, proposes slots, books appointment

---

## Cryptographic Auth

Every agent-to-agent call is signed:

1. Caller builds payload: `{ capability, scopes, input, nonce, timestamp }`
2. Canonical JSON serialization (sorted keys)
3. Ed25519 detached signature with caller's private key
4. Headers: `X-Caller-Handle` + `X-Signature` (hex)
5. Callee verifies signature against caller's registered public key
6. Nonce checked against per-caller set (replay prevention)
7. Timestamp must be < 5 minutes old

---

## Policy Engine

Evaluated on every `/u/{handle}/invoke` call:

1. Find policy for `(callee, capability)`
2. No policy found → **allow** (open access)
3. Check `allowed_callers` whitelist (or `["*"]`)
4. Check `required_scopes` ⊆ request scopes
5. If `payment_required` and scope missing → **402** with checkout URL
6. Pass → route to capability handler

---

## LLM Integration

**Provider-switchable** — toggle between OpenAI and Claude per request.

| Provider | Model | Use |
|----------|-------|-----|
| OpenAI | GPT-4o | Scheduling planner, health explainer, patient decision, triage |
| Anthropic | Claude Sonnet | Same capabilities, alternate provider |

- JSON schema enforcement on responses
- System prompts define personas (patient, doctor receptionist)
- **Deterministic fallback** on every LLM call — app works fully without API keys

---

## Supabase-Specific Features

| Feature | Usage |
|---------|-------|
| **Postgres** | All data models above |
| **Row-Level Security** | Restrict health data to owning patient + authorized agents |
| **Realtime** | Live trace updates during demo flows |
| **Edge Functions** | Capability handlers deployable as Supabase Edge Functions |
| **Auth integration** | Clerk webhook syncs users to Supabase |

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_ANON_KEY` | Yes | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (server-side) |
| `OPENAI_API_KEY` | No | GPT-4o (optional, has deterministic fallback) |
| `ANTHROPIC_API_KEY` | No | Claude Sonnet (optional, has deterministic fallback) |
| `CLERK_SECRET_KEY` | No | Clerk auth (optional) |
| `GOOGLE_CLIENT_ID` | No | Google Calendar sync (optional) |

---

## Project Structure

```
treehacks2026/
├── apps/
│   └── web/                    # Next.js 14 frontend
│       ├── app/
│       │   ├── dashboard/      # UI pages (demo, anomaly, calendar, agents)
│       │   └── api/            # FastAPI-proxied routes (during dev)
│       ├── components/         # TraceViewer, ProviderToggle, JsonView, etc.
│       └── lib/                # Client-side helpers
├── backend/                    # FastAPI backend
│   ├── main.py                 # App entry, CORS, router mounts
│   ├── routers/
│   │   ├── registry.py         # /registry/*
│   │   ├── agent.py            # /u/{handle}/*
│   │   ├── demo.py             # /demo/*
│   │   └── anomaly.py          # /anomaly/*
│   ├── services/
│   │   ├── crypto.py           # Ed25519 signing & verification
│   │   ├── policy.py           # Policy evaluation engine
│   │   ├── trace.py            # Trace recording & retrieval
│   │   ├── people.py           # Capability routing
│   │   ├── llm.py              # Provider factory (OpenAI / Claude)
│   │   └── capabilities/
│   │       ├── scheduling.py
│   │       ├── health_anomaly.py
│   │       └── triage.py
│   ├── models/                 # Pydantic models
│   └── db.py                   # Supabase client
├── packages/
│   └── shared/                 # Shared types & Zod schemas
└── supabase/
    └── migrations/             # SQL migrations
```

---

## Seeded Demo Data

| Handle | Role | Capabilities |
|--------|------|-------------|
| `pari` | Patient | `schedule_propose`, `schedule_confirm`, `health_summary`, `health.anomaly_alert` |
| `alex` | Peer | `schedule_propose`, `schedule_counter`, `schedule_confirm` |
| `dr_smith` | Doctor | `triage.intake_and_schedule` |

- 30 days of health metrics for Pari
- Pre-populated calendar events for Alex (conflict testing)
- Deterministic Ed25519 keypairs (reproducible across restarts)
