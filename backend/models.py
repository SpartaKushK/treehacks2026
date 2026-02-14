"""AgentMesh data models — Pydantic v2 schemas."""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional
from pydantic import BaseModel, Field
import uuid


# ── Agent Registry ──────────────────────────────────────────


class AgentRegistration(BaseModel):
    """POST /agents/register request body."""
    name: str = Field(..., min_length=1, max_length=100)
    description: str = Field(..., min_length=5, max_length=500)
    tags: list[str] = Field(default_factory=list)
    input_schema: dict[str, Any] = Field(...)
    output_schema: dict[str, Any] = Field(...)
    endpoint: str = Field(...)
    auth: Optional[str] = None
    cost: str = Field("free")


class AgentRecord(BaseModel):
    """Stored agent record returned by the registry."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str
    tags: list[str] = Field(default_factory=list)
    input_schema: dict[str, Any]
    output_schema: dict[str, Any]
    endpoint: str
    auth: Optional[str] = None
    cost: str = "free"
    created_at: datetime = Field(default_factory=datetime.utcnow)
    is_active: bool = True


class AgentSearchRequest(BaseModel):
    """POST /agents/search request body."""
    query: str = Field(..., min_length=1)
    top_k: int = Field(5, ge=1, le=20)


class AgentSearchResult(BaseModel):
    """Single search result with similarity score."""
    agent: AgentRecord
    score: float


# ── Agent Protocol ──────────────────────────────────────────


class AgentRunRequest(BaseModel):
    """Universal POST /run request for all agents."""
    input: dict[str, Any]
    context: Optional[dict[str, Any]] = None


class AgentRunResponse(BaseModel):
    """Universal POST /run response from all agents."""
    output: dict[str, Any]
    meta: Optional[dict[str, Any]] = None


# ── Orchestrator ────────────────────────────────────────────


class StepStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    SKIPPED = "skipped"


class PlanStep(BaseModel):
    """Single step in an execution plan."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    agent_query: str
    input: dict[str, Any]
    success_criteria: str
    on_fail: str = "retry_then_next"
    depends_on: list[str] = Field(default_factory=list)


class ExecutionPlan(BaseModel):
    """Output from the planner LLM."""
    goal: str
    steps: list[PlanStep]


class StepResult(BaseModel):
    """Result of executing a single step."""
    step_id: str
    status: StepStatus
    agent_id: Optional[str] = None
    agent_name: Optional[str] = None
    output: Optional[dict[str, Any]] = None
    error: Optional[str] = None
    duration_ms: int = 0
    retries: int = 0


class OrchestrationRequest(BaseModel):
    """POST /orchestrate request body."""
    user_goal: str = Field(..., min_length=5)
    context: Optional[dict[str, Any]] = None


class OrchestrationResponse(BaseModel):
    """POST /orchestrate response body."""
    trace_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    goal: str
    plan: ExecutionPlan
    results: list[StepResult]
    status: str  # completed | partial | failed
    artifacts: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)
