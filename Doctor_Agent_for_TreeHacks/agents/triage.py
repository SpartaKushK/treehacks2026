"""
Triage Agent — the first node in the doctor agent pipeline.

Uses LangGraph to model the triage as a state machine:
  [receive_alert] → [classify] → [decide_action] → [dispatch]
                                      ↓
                              CRITICAL? → [escalate]
                              else     → [schedule] → [send_forms]

The agent uses Claude with native tool calling to reason about
the alert and produce a structured TriageResult.
"""

import json
import uuid
import logging
from typing import TypedDict, Optional, List
from datetime import datetime

import anthropic
from langgraph.graph import StateGraph, END

from models.schemas import (
    HealthAlert, TriageResult, Severity, AlertType
)
import config

logger = logging.getLogger(__name__)

# ─── LangGraph State ──────────────────────────────────────────────────────────

class TriageState(TypedDict):
    """State that flows through the triage graph."""
    alert: dict                          # HealthAlert as dict (LangGraph needs serializable state)
    messages: list                       # Raw Anthropic message history (managed by our tool loop)
    severity: Optional[str]
    reasoning: Optional[str]
    appointment_type: Optional[str]
    appointment_urgency_hours: Optional[int]
    recommended_forms: List[str]
    should_escalate: bool
    escalation_reason: Optional[str]
    action_summary: Optional[str]
    triage_complete: bool


# ─── Claude Tool Definitions ──────────────────────────────────────────────────

TRIAGE_TOOLS = [
    {
        "name": "classify_severity",
        "description": "Classify the severity of the health alert (low/medium/high/critical) based on clinical guidelines.",
        "input_schema": {
            "type": "object",
            "properties": {
                "severity": {
                    "type": "string",
                    "enum": ["low", "medium", "high", "critical"],
                    "description": "The severity level"
                },
                "reasoning": {
                    "type": "string",
                    "description": "Clinical reasoning for this severity classification"
                }
            },
            "required": ["severity", "reasoning"]
        }
    },
    {
        "name": "set_appointment_details",
        "description": "Specify what type of appointment is needed and how urgently.",
        "input_schema": {
            "type": "object",
            "properties": {
                "appointment_type": {
                    "type": "string",
                    "description": "Type of appointment (e.g. 'Urgent Cardiac Consultation')"
                },
                "urgency_hours": {
                    "type": "integer",
                    "description": "How many hours until appointment is needed (null if no appointment needed)",
                    "nullable": True
                },
                "needs_appointment": {
                    "type": "boolean",
                    "description": "Whether an appointment should be scheduled at all"
                }
            },
            "required": ["appointment_type", "needs_appointment"]
        }
    },
    {
        "name": "select_intake_forms",
        "description": "Select which intake forms the patient should complete before their appointment.",
        "input_schema": {
            "type": "object",
            "properties": {
                "form_keys": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Keys from the forms library: cardiac_symptoms, afib_history, respiratory_symptoms, injury_assessment, sleep_questionnaire, bp_history, glucose_tracking, general_intake"
                }
            },
            "required": ["form_keys"]
        }
    },
    {
        "name": "check_escalation",
        "description": "Determine if this alert requires immediate emergency escalation (calling 911, paging on-call doctor, etc.) rather than scheduling.",
        "input_schema": {
            "type": "object",
            "properties": {
                "should_escalate": {
                    "type": "boolean",
                    "description": "True if this is a life-threatening emergency"
                },
                "escalation_reason": {
                    "type": "string",
                    "description": "Why this requires escalation (if should_escalate is true)",
                    "nullable": True
                }
            },
            "required": ["should_escalate"]
        }
    },
    {
        "name": "finalize_triage",
        "description": "Complete the triage with a patient-facing summary of what will happen next.",
        "input_schema": {
            "type": "object",
            "properties": {
                "action_summary": {
                    "type": "string",
                    "description": "Plain-language summary of the action being taken, suitable for the patient"
                }
            },
            "required": ["action_summary"]
        }
    }
]


# ─── Tool Execution ───────────────────────────────────────────────────────────

def execute_tool(tool_name: str, tool_input: dict, state: TriageState) -> tuple[str, TriageState]:
    """Execute a tool call and update state. Returns (result_string, updated_state)."""

    if tool_name == "classify_severity":
        state["severity"] = tool_input["severity"]
        state["reasoning"] = tool_input["reasoning"]
        return f"Severity classified as: {tool_input['severity']}", state

    elif tool_name == "set_appointment_details":
        state["appointment_type"] = tool_input["appointment_type"]
        state["appointment_urgency_hours"] = tool_input.get("urgency_hours")
        # If no appointment needed, mark complete path
        if not tool_input.get("needs_appointment"):
            state["appointment_urgency_hours"] = None
        return f"Appointment type set: {tool_input['appointment_type']}", state

    elif tool_name == "select_intake_forms":
        form_keys = tool_input.get("form_keys", [])
        forms = []
        for key in form_keys:
            form_url = config.INTAKE_FORMS.get(key, config.INTAKE_FORMS["default"])
            forms.append(form_url)
        state["recommended_forms"] = forms
        return f"Selected {len(forms)} intake form(s): {form_keys}", state

    elif tool_name == "check_escalation":
        state["should_escalate"] = tool_input["should_escalate"]
        state["escalation_reason"] = tool_input.get("escalation_reason")
        return f"Escalation check: {tool_input['should_escalate']}", state

    elif tool_name == "finalize_triage":
        state["action_summary"] = tool_input["action_summary"]
        state["triage_complete"] = True
        return "Triage finalized.", state

    else:
        return f"Unknown tool: {tool_name}", state


# ─── LangGraph Nodes ──────────────────────────────────────────────────────────

def run_claude_triage(state: TriageState) -> TriageState:
    """
    Core node: calls Claude with the health alert and runs a tool-calling loop
    until Claude has called all necessary tools and finalized the triage.
    """
    client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY)

    # Load system prompt (resolve relative to this package's root)
    import pathlib
    _project_root = pathlib.Path(__file__).resolve().parent.parent
    with open(_project_root / "prompts" / "triage_prompt.txt") as f:
        system_prompt = f.read().format(doctor_name=config.DOCTOR_NAME)

    alert = state["alert"]
    user_message = f"""
New health alert received:

Patient: {alert['patient_name']} (ID: {alert['patient_id']})
Alert Type: {alert['alert_type']}
Description: {alert['description']}
Metric Value: {alert.get('metric_value', 'N/A')} {alert.get('metric_unit', '')}
Normal Threshold: {alert.get('threshold_value', 'N/A')} {alert.get('metric_unit', '')}
Timestamp: {alert['timestamp']}

Please analyze this alert. Use your tools in this order:
1. check_escalation (is this life-threatening right now?)
2. classify_severity
3. set_appointment_details
4. select_intake_forms
5. finalize_triage (write a patient-facing summary)
"""

    messages = [{"role": "user", "content": user_message}]
    max_iterations = 10

    for iteration in range(max_iterations):
        response = client.messages.create(
            model=config.CLAUDE_MODEL,
            max_tokens=2048,
            system=system_prompt,
            tools=TRIAGE_TOOLS,
            messages=messages,
        )

        logger.debug(f"Claude response (iteration {iteration}): stop_reason={response.stop_reason}")

        # Collect all content from this response — serialize to plain dicts
        # so LangGraph state serialization doesn't choke on Anthropic SDK objects.
        assistant_content = []
        tool_results = []

        for block in response.content:
            if block.type == "text":
                assistant_content.append({"type": "text", "text": block.text})
            elif block.type == "tool_use":
                assistant_content.append({
                    "type": "tool_use",
                    "id": block.id,
                    "name": block.name,
                    "input": block.input,
                })
                logger.info(f"Tool called: {block.name} with input: {block.input}")
                result_text, state = execute_tool(block.name, block.input, state)

                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": result_text,
                })

        # Add assistant turn to message history
        messages.append({"role": "assistant", "content": assistant_content})

        # If there were tool calls, add all results in a single user turn
        if tool_results:
            messages.append({"role": "user", "content": tool_results})

        # Check if done
        if state.get("triage_complete"):
            logger.info("Triage complete.")
            break

        if response.stop_reason == "end_turn" and not tool_results:
            logger.warning("Claude stopped without completing triage — extracting partial state.")
            break

    state["messages"] = messages
    return state


def route_after_triage(state: TriageState) -> str:
    """Conditional edge: where to go after triage."""
    if state.get("should_escalate"):
        return "escalate"
    elif state.get("appointment_urgency_hours") is not None:
        return "schedule"
    else:
        return "low_severity_response"


def escalate_node(state: TriageState) -> TriageState:
    """
    Handle critical alerts. In production: page on-call doctor,
    call 911 API, send urgent SMS. For now: log and flag.
    """
    logger.critical(
        f"🚨 ESCALATION TRIGGERED for patient {state['alert']['patient_id']}: "
        f"{state.get('escalation_reason')}"
    )
    # TODO: integrate with PagerDuty, Twilio emergency SMS, etc.
    state["action_summary"] = (
        f"EMERGENCY: {state.get('escalation_reason', 'Critical health alert detected')}. "
        f"Emergency services have been notified. Please call 911 immediately."
    )
    return state


def low_severity_response_node(state: TriageState) -> TriageState:
    """Handle low-severity alerts that don't need an appointment."""
    logger.info(f"Low severity alert for patient {state['alert']['patient_id']} — no appointment needed.")
    return state


# ─── Build the LangGraph ──────────────────────────────────────────────────────

def build_triage_graph() -> StateGraph:
    graph = StateGraph(TriageState)

    # Add nodes
    graph.add_node("triage", run_claude_triage)
    graph.add_node("escalate", escalate_node)
    graph.add_node("low_severity_response", low_severity_response_node)
    # "schedule" node will be added by the orchestrator that wires all agents together
    # For now we end at schedule so the API layer can hand off
    graph.add_node("schedule", lambda s: s)  # passthrough, handled by scheduler agent

    # Entry point
    graph.set_entry_point("triage")

    # Routing after triage
    graph.add_conditional_edges(
        "triage",
        route_after_triage,
        {
            "escalate": "escalate",
            "schedule": "schedule",
            "low_severity_response": "low_severity_response",
        }
    )

    # All paths end
    graph.add_edge("escalate", END)
    graph.add_edge("schedule", END)
    graph.add_edge("low_severity_response", END)

    return graph.compile()


# ─── Public Interface ─────────────────────────────────────────────────────────

# Compile once at import time
triage_graph = build_triage_graph()


def run_triage(alert: HealthAlert) -> TriageResult:
    """
    Main entry point. Takes a HealthAlert, runs the triage graph,
    returns a TriageResult.
    """
    initial_state: TriageState = {
        "alert": alert.model_dump(mode="json"),
        "messages": [],
        "severity": None,
        "reasoning": None,
        "appointment_type": None,
        "appointment_urgency_hours": None,
        "recommended_forms": [],
        "should_escalate": False,
        "escalation_reason": None,
        "action_summary": None,
        "triage_complete": False,
    }

    logger.info(f"Running triage for alert: {alert.alert_type} | patient: {alert.patient_id}")
    final_state = triage_graph.invoke(initial_state)

    return TriageResult(
        alert=alert,
        severity=Severity(final_state.get("severity", "medium")),
        reasoning=final_state.get("reasoning", ""),
        appointment_type=final_state.get("appointment_type", "General Health Review"),
        appointment_urgency_hours=final_state.get("appointment_urgency_hours"),
        recommended_forms=final_state.get("recommended_forms", []),
        should_escalate=final_state.get("should_escalate", False),
        escalation_reason=final_state.get("escalation_reason"),
        action_summary=final_state.get("action_summary", "Alert received and processed."),
    )
