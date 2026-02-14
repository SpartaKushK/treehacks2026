"""AgentMesh Backend — FastAPI application with registry + orchestration endpoints."""
from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from config import CORS_ORIGINS
from database import create_tables
from models import (
    AgentRegistration,
    AgentRecord,
    AgentSearchRequest,
    AgentSearchResult,
    OrchestrationRequest,
    OrchestrationResponse,
)
from registry import AgentRegistry
from orchestrator import Orchestrator

# ── Global singletons ──────────────────────────────────────

# ── Startup init (run at import time) ─────────────────────

create_tables()

registry = AgentRegistry()
registry.rebuild_index()

orchestrator = Orchestrator(registry)
print("[AgentMesh] Backend ready")

app = FastAPI(
    title="AgentMesh",
    description="Plug-and-play agent interoperability platform",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health ──────────────────────────────────────────────────

@app.get("/health")
def health():
    return {
        "status": "ok",
        "agents_count": registry.faiss_index.index.ntotal,
    }


# ── Agent Registry ─────────────────────────────────────────

@app.post("/agents/register", status_code=201, response_model=AgentRecord)
def register_agent(body: AgentRegistration):
    try:
        record = registry.register(body)
        return record
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/agents/list", response_model=list[AgentRecord])
def list_agents():
    return registry.list_all()


@app.post("/agents/search", response_model=list[AgentSearchResult])
def search_agents(body: AgentSearchRequest):
    try:
        results = registry.search(body.query, body.top_k)
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Orchestration ──────────────────────────────────────────

@app.post("/orchestrate", response_model=OrchestrationResponse)
def orchestrate(body: OrchestrationRequest):
    try:
        result = orchestrator.run(body)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Entry point ────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
