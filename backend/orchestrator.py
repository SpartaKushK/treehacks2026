"""AgentMesh Orchestrator — GPT-4o planner + step executor with retry logic."""
from __future__ import annotations

import json
import re
import time
from typing import Any, Optional

import httpx
from openai import OpenAI

from config import (
    OPENAI_API_KEY,
    ORCHESTRATOR_MODEL,
    PLANNER_TEMPERATURE,
    AGENT_CALL_TIMEOUT,
    MAX_RETRIES,
)
from models import (
    ExecutionPlan,
    PlanStep,
    StepResult,
    StepStatus,
    OrchestrationRequest,
    OrchestrationResponse,
    AgentSearchResult,
)
from registry import AgentRegistry


PLANNER_SYSTEM_PROMPT = """You are AgentMesh Planner. Given a user goal and a list of available agent capabilities, decompose the goal into sequential steps.

Each step must specify:
- id: a short unique identifier like "step_1", "step_2", etc.
- agent_query: a natural language description of what kind of agent is needed for this step (used for semantic search)
- input: a JSON object of input data for the agent. You may reference outputs from previous steps using the template syntax {{step_N.output.key}} where N is the step id.
- success_criteria: a brief description of what a successful output looks like
- on_fail: what to do if this step fails. Options: "retry_then_next", "skip", "ask_user"

IMPORTANT RULES:
1. Use agent_query to describe the CAPABILITY needed, not a specific agent name. Example: "research competitors in a market" not "call ResearchAgent".
2. Keep step inputs as simple as possible — use template references to chain outputs.
3. Order steps logically — research before content generation, content before deployment.
4. Include 2-6 steps typically.

You MUST respond with valid JSON matching this exact schema:
{
  "goal": "the user's original goal",
  "steps": [
    {
      "id": "step_1",
      "agent_query": "description of needed capability",
      "input": {"key": "value"},
      "success_criteria": "what success looks like",
      "on_fail": "retry_then_next"
    }
  ]
}"""


class Planner:
    """Uses GPT-4o to decompose a user goal into execution steps."""

    def __init__(self, client: OpenAI, registry: AgentRegistry):
        self.client = client
        self.registry = registry

    def create_plan(self, user_goal: str, context: Optional[dict] = None) -> ExecutionPlan:
        agents = self.registry.list_all()
        agent_summary = "\n".join(
            f"- {a.name}: {a.description} (tags: {', '.join(a.tags)})"
            for a in agents
        )

        user_msg = f"Goal: {user_goal}\n\nAvailable agent capabilities:\n{agent_summary}"
        if context:
            user_msg += f"\n\nAdditional context: {json.dumps(context)}"

        response = self.client.chat.completions.create(
            model=ORCHESTRATOR_MODEL,
            temperature=PLANNER_TEMPERATURE,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": PLANNER_SYSTEM_PROMPT},
                {"role": "user", "content": user_msg},
            ],
        )

        raw = json.loads(response.choices[0].message.content)
        steps = []
        for s in raw.get("steps", []):
            steps.append(PlanStep(
                id=s.get("id", f"step_{len(steps)+1}"),
                agent_query=s["agent_query"],
                input=s.get("input", {}),
                success_criteria=s.get("success_criteria", "Output is valid JSON"),
                on_fail=s.get("on_fail", "retry_then_next"),
                depends_on=s.get("depends_on", []),
            ))
        return ExecutionPlan(goal=user_goal, steps=steps)


class Executor:
    """Executes plan steps by discovering agents and calling them."""

    def __init__(self, registry: AgentRegistry):
        self.registry = registry

    def execute_plan(self, plan: ExecutionPlan) -> list[StepResult]:
        completed: dict[str, StepResult] = {}
        results = []

        for step in plan.steps:
            result = self._execute_step(step, completed)
            completed[step.id] = result
            results.append(result)

        return results

    def _execute_step(self, step: PlanStep, completed: dict[str, StepResult]) -> StepResult:
        start = time.time()

        # 1. Search for matching agents
        search_results = self.registry.search(step.agent_query, top_k=3)
        if not search_results:
            return StepResult(
                step_id=step.id,
                status=StepStatus.FAILED,
                error="No matching agents found in registry",
                duration_ms=int((time.time() - start) * 1000),
            )

        # 2. Resolve template variables in input
        resolved_input = self._resolve_input(step.input, completed)

        # 3. Try agents in ranked order
        last_error = None
        for attempt, sr in enumerate(search_results):
            agent = sr.agent
            try:
                output = self._call_agent(agent.endpoint, resolved_input, agent.auth)
                return StepResult(
                    step_id=step.id,
                    status=StepStatus.SUCCESS,
                    agent_id=agent.id,
                    agent_name=agent.name,
                    output=output,
                    duration_ms=int((time.time() - start) * 1000),
                    retries=attempt,
                )
            except Exception as e:
                last_error = str(e)
                if attempt == 0 and step.on_fail == "retry_then_next":
                    # Retry same agent once
                    try:
                        output = self._call_agent(agent.endpoint, resolved_input, agent.auth)
                        return StepResult(
                            step_id=step.id,
                            status=StepStatus.SUCCESS,
                            agent_id=agent.id,
                            agent_name=agent.name,
                            output=output,
                            duration_ms=int((time.time() - start) * 1000),
                            retries=1,
                        )
                    except Exception as retry_e:
                        last_error = str(retry_e)
                        continue
                continue

        # All agents failed
        if step.on_fail == "skip":
            return StepResult(
                step_id=step.id,
                status=StepStatus.SKIPPED,
                error=last_error,
                duration_ms=int((time.time() - start) * 1000),
            )

        return StepResult(
            step_id=step.id,
            status=StepStatus.FAILED,
            error=last_error,
            duration_ms=int((time.time() - start) * 1000),
        )

    def _call_agent(self, endpoint: str, input_data: dict, auth: Optional[str] = None) -> dict:
        """HTTP POST to an agent's /run endpoint."""
        headers = {"Content-Type": "application/json"}
        if auth:
            headers["Authorization"] = f"Bearer {auth}"

        with httpx.Client(timeout=AGENT_CALL_TIMEOUT) as client:
            response = client.post(
                endpoint,
                json={"input": input_data, "context": {}},
                headers=headers,
            )
            response.raise_for_status()
            data = response.json()
            return data.get("output", data)

    def _resolve_input(self, raw_input: dict, completed: dict[str, StepResult]) -> dict:
        """Replace {{step_N.output.key}} with actual values from completed steps."""
        serialized = json.dumps(raw_input)
        pattern = r"\{\{(step_\w+)\.output\.(\w+)\}\}"

        def replacer(match):
            step_id = match.group(1)
            key = match.group(2)
            result = completed.get(step_id)
            if result and result.output:
                value = result.output.get(key, match.group(0))
                if isinstance(value, str):
                    return value
                return json.dumps(value)
            return match.group(0)

        resolved = re.sub(pattern, replacer, serialized)
        try:
            return json.loads(resolved)
        except json.JSONDecodeError:
            return raw_input


class Orchestrator:
    """High-level facade: plan + execute + store trace."""

    def __init__(self, registry: AgentRegistry):
        self.registry = registry
        self.client = OpenAI(api_key=OPENAI_API_KEY)
        self.planner = Planner(self.client, registry)
        self.executor = Executor(registry)

    def run(self, request: OrchestrationRequest) -> OrchestrationResponse:
        # 1. Plan
        plan = self.planner.create_plan(request.user_goal, request.context)

        # 2. Execute
        results = self.executor.execute_plan(plan)

        # 3. Determine status
        statuses = [r.status for r in results]
        if all(s == StepStatus.SUCCESS for s in statuses):
            status = "completed"
        elif any(s == StepStatus.SUCCESS for s in statuses):
            status = "partial"
        else:
            status = "failed"

        # 4. Collect artifacts (outputs from all successful steps)
        artifacts = {}
        for r in results:
            if r.status == StepStatus.SUCCESS and r.output:
                artifacts[r.step_id] = r.output

        # 5. Build response
        response = OrchestrationResponse(
            goal=request.user_goal,
            plan=plan,
            results=results,
            status=status,
            artifacts=artifacts,
        )

        # 6. Store trace (fire-and-forget)
        try:
            from database import insert_trace
            insert_trace({
                "trace_id": response.trace_id,
                "goal": response.goal,
                "plan": plan.model_dump(),
                "results": [r.model_dump() for r in results],
                "status": status,
            })
        except Exception:
            pass  # Don't fail the response if trace storage fails

        return response
