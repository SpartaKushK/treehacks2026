# AgentMesh — Plug-and-Play Agent Interoperability

> **TreeHacks 2025** — Agents register capabilities, get discovered automatically via semantic search, and are orchestrated into multi-step workflows. Add a new agent live — zero code changes.

## Problem

AI agents are siloed. Every integration requires custom glue code. There's no standard way to discover what agents can do, or to compose them into workflows dynamically.

## Solution

**AgentMesh** provides:
1. **Agent Registry** — agents register with name, description, schemas, and endpoint
2. **Semantic Discovery** — find the right agent for any task using embedding-based search (FAISS + OpenAI)
3. **Automatic Orchestration** — GPT-4o decomposes goals into steps, discovers agents, executes with retry/fallback
4. **Live Plug-in** — register a new agent at runtime; the orchestrator uses it immediately

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Next.js Frontend (:3000)            │
│   [Chat UI]  [Agent List]  [Register Agent Form]     │
└──────────────────────┬──────────────────────────────┘
                       │ REST
┌──────────────────────▼──────────────────────────────┐
│              FastAPI Backend (:8000)                  │
│  ┌──────────┐  ┌────────────┐  ┌─────────────────┐  │
│  │ Registry │  │Orchestrator│  │ Sandbox Runner   │  │
│  │ + FAISS  │  │ (GPT-4o)   │  │ (Modal)          │  │
│  └────┬─────┘  └─────┬──────┘  └────────┬────────┘  │
│       │              │                   │           │
│  PostgreSQL     OpenAI API          Modal Cloud      │
└───────┼──────────────┼───────────────────┼──────────┘
        │              │
┌───────▼──────────────▼──────────────────────────────┐
│              Agent Services (POST /run)               │
│  :8001 Research  :8002 Copy  :8003 Deploy            │
│  :8004 Outreach  :8005 Pricing  :8006 Summary(Ollama)│
└─────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites
- Python 3.9+ with pip
- Node.js 20+ with pnpm
- PostgreSQL running on port 5432
- Ollama running with `llama3.2` model (port 11434)

### 1. Set up environment

```bash
cd agentmesh
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY

createdb agentmesh  # if not already created
pip install -r backend/requirements.txt
```

### 2. Start the backend

```bash
cd backend
OPENAI_API_KEY=sk-... python main.py
# Backend runs on http://localhost:8000
```

### 3. Start agents + register them

```bash
# In a new terminal:
cd agents
OPENAI_API_KEY=sk-... python run_all.py
# Starts 6 agents (ports 8001-8006) and registers 5 with the backend
# PricingAgent (port 8005) runs but is NOT registered — for live demo
```

### 4. Start the frontend

```bash
# In a new terminal:
cd frontend
pnpm install && pnpm dev
# Frontend runs on http://localhost:3000
```

### 5. Demo it

1. Open http://localhost:3000
2. Enter: *"Create a landing page for AcmeCo, research 3 competitors, and draft 2 outbound emails"*
3. Watch the orchestrator plan and execute across agents
4. Go to http://localhost:3000/agents → Register PricingAgent → re-run the goal
5. The orchestrator now includes a pricing step — zero code changes!

## Prize Requirements

| Prize | How We Address It |
|-------|-------------------|
| **OpenAI** | GPT-4o orchestrator with strict JSON tool calling. GPT-4o-mini for agent LLM calls. OpenAI `text-embedding-3-small` for semantic search. |
| **NVIDIA** | SummaryAgent runs on local Ollama `llama3.2` (open-source model), abstracted behind the same Agent protocol. |
| **Modal** | SandboxAgentRunner executes untrusted Python in Modal's sandboxed containers. |
| **Greylock (Multi-turn)** | Orchestrator handles failures with retry → fallback → user clarification flow. |

## Agent Protocol

Every agent is an HTTP service implementing:

```
POST /run
Body: { "input": {...}, "context": {...} }
Response: { "output": {...}, "meta": {...} }
```

Register via `POST /agents/register` with name, description, tags, input/output schemas, and endpoint URL.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/agents/register` | Register a new agent |
| GET | `/agents/list` | List all registered agents |
| POST | `/agents/search` | Semantic search for agents |
| POST | `/orchestrate` | Execute a multi-step workflow |
| GET | `/health` | Backend health check |

## Tech Stack

- **Backend:** Python 3.9, FastAPI, SQLAlchemy, FAISS, OpenAI SDK
- **Frontend:** Next.js 14, React, Tailwind CSS, TypeScript
- **Database:** PostgreSQL 14
- **Vector Search:** FAISS (in-memory, rebuilt from PG on startup)
- **LLMs:** GPT-4o (orchestrator), GPT-4o-mini (agents), Ollama llama3.2 (open model)
- **Sandbox:** Modal (isolated Python execution)
