/**
 * Secretary Agent — Powered by Claude Agent SDK
 *
 * Replaces the manual LLM agent loop with the Claude Agent SDK's `query()`
 * function. The SDK handles the tool-calling loop automatically, while we
 * provide custom healthcare tools via an in-process MCP server and integrate
 * observability via hooks.
 *
 * New capabilities enabled by the SDK:
 *   - WebSearch: real-time health research for high-severity anomalies
 *   - Subagents: parallel task delegation (health_researcher)
 *   - Sessions: multi-turn patient conversations via session resumption
 *   - Hooks: full trace observability piped to PostgreSQL
 */

import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { SECRETARY_SYSTEM_PROMPT } from "./prompts";
import {
  healthcareServer,
  setActiveContext,
  getActiveContext,
} from "./healthcareMcpServer";
import { preToolUseHook, postToolUseHook } from "./traceHooks";
import { startTrace, addStep, finalizeTrace } from "../trace";
import {
  getHistory,
  formatHistoryForLLM,
  saveInteraction,
  saveToolInteraction,
  type AgentType,
} from "../memory";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface SecretaryInput {
  /** Raw trigger data from the health app / wearable / external source */
  triggerData: Record<string, unknown>;
  /** LLM provider to use (always "claude" with Agent SDK) */
  provider: "openai" | "claude";
  /** Optional user-facing description of the trigger */
  triggerDescription?: string;
}

export interface SecretaryResult {
  /** Unique trace ID for this workflow run */
  traceId: string;
  /** The secretary's final text decision / summary */
  finalDecision: string;
  /** Ordered list of tool calls made during the workflow */
  toolCallLog: ToolCallLogEntry[];
  /** LLM provider used */
  provider: "openai" | "claude";
  /** Number of LLM turns taken */
  turns: number;
  /** Session ID for multi-turn continuation */
  sessionId?: string;
  /** Cost in USD (from Agent SDK) */
  costUsd?: number;
}

interface ToolCallLogEntry {
  tool: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/*  Main entry point                                                   */
/* ------------------------------------------------------------------ */

export async function runSecretary(
  input: SecretaryInput
): Promise<SecretaryResult> {
  const { triggerData, triggerDescription } = input;

  // Resolve the user handle for memory scoping
  const userHandle = (triggerData.user_handle as string) || "unknown";

  // Start a trace for observability
  const traceId = startTrace({
    provider: "claude",
    title: `Secretary: ${triggerDescription || "health trigger"}`,
  });

  const toolCallLog: ToolCallLogEntry[] = [];

  addStep(traceId, {
    actor: "secretary",
    event: "WORKFLOW_START",
    ok: true,
    data: { triggerData, provider: "claude", sdk: "claude-agent-sdk" },
  });

  // Build the user message from the trigger
  const userMessage = triggerDescription
    ? `${triggerDescription}\n\nTrigger data:\n${JSON.stringify(triggerData, null, 2)}`
    : `New health trigger received:\n${JSON.stringify(triggerData, null, 2)}`;

  // Check for API key — fall back to deterministic if missing
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const fallback = deterministicFallback(userMessage);
    addStep(traceId, {
      actor: "secretary",
      event: "WORKFLOW_COMPLETE",
      ok: true,
      data: { finalDecision: fallback, toolCallsCount: 0, turns: 1 },
    });
    await finalizeTrace(traceId);
    return {
      traceId,
      finalDecision: fallback,
      toolCallLog: [],
      provider: "claude",
      turns: 1,
    };
  }

  // Set context for MCP tools and hooks
  setActiveContext({ traceId, provider: "claude", triggerData });

  try {
    const result = await runAgentSDKLoop(userMessage, traceId, toolCallLog);

    addStep(traceId, {
      actor: "secretary",
      event: "WORKFLOW_COMPLETE",
      ok: true,
      data: {
        finalDecision: result.finalDecision.slice(0, 500),
        toolCallsCount: toolCallLog.length,
        turns: result.turns,
        costUsd: result.costUsd,
      },
    });

    await finalizeTrace(traceId);

    // Save this interaction to memory
    try {
      await saveInteraction(
        "secretary",
        userHandle,
        userMessage,
        result.finalDecision,
        { provider: "claude", turns: result.turns, toolCallsCount: toolCallLog.length },
      );
      for (const tc of toolCallLog) {
        await saveToolInteraction("secretary", userHandle, tc.tool, tc.args, tc.result);
      }
    } catch (e) {
      console.warn("[Secretary] Failed to save memory:", e);
    }

    return {
      traceId,
      finalDecision: result.finalDecision,
      toolCallLog,
      provider: "claude",
      turns: result.turns,
      sessionId: result.sessionId,
      costUsd: result.costUsd,
    };
  } catch (err) {
    console.error("[Secretary/AgentSDK] Error:", err);
    const fallback =
      toolCallLog.length > 0
        ? buildFallbackSummary(toolCallLog)
        : `Agent SDK error: ${err instanceof Error ? err.message : String(err)}`;

    addStep(traceId, {
      actor: "secretary",
      event: "WORKFLOW_ERROR",
      ok: false,
      data: { error: String(err) },
    });

    await finalizeTrace(traceId);

    return {
      traceId,
      finalDecision: fallback,
      toolCallLog,
      provider: "claude",
      turns: 0,
    };
  } finally {
    setActiveContext(null);
  }
}

/* ------------------------------------------------------------------ */
/*  Agent SDK Loop                                                     */
/* ------------------------------------------------------------------ */

interface AgentLoopResult {
  finalDecision: string;
  turns: number;
  sessionId?: string;
  costUsd?: number;
}

async function runAgentSDKLoop(
  userMessage: string,
  traceId: string,
  toolCallLog: ToolCallLogEntry[]
): Promise<AgentLoopResult> {
  let finalDecision = "";
  let turns = 0;
  let sessionId: string | undefined;
  let costUsd: number | undefined;

  const q = query({
    prompt: userMessage,
    options: {
      systemPrompt: SECRETARY_SYSTEM_PROMPT,
      model: "claude-sonnet-4-5-20250929",
      maxTurns: 10,
      persistSession: false,

      // Custom healthcare tools via in-process MCP server
      mcpServers: {
        healthcare: healthcareServer,
      },

      // Enable healthcare MCP tools + built-in web research tools
      allowedTools: [
        "mcp__healthcare__analyze_anomaly",
        "mcp__healthcare__lookup_clinical_evidence",
        "mcp__healthcare__triage_patient",
        "mcp__healthcare__get_health_summary",
        "mcp__healthcare__schedule_appointment",
        "WebSearch",
        "WebFetch",
      ],

      // Only expose allowed tools (disable all other built-in tools)
      tools: [],

      // Subagents for parallel research
      agents: {
        health_researcher: {
          description:
            "Researches health conditions and anomalies using web search to provide evidence-based context from medical sources",
          tools: ["WebSearch", "WebFetch"],
          prompt:
            "You are a health research assistant. When asked about a health condition, anomaly, or symptom, search the web for evidence-based medical information from reputable sources (Mayo Clinic, NIH, CDC, WHO). Summarize findings concisely with citations. You are NOT a doctor - clearly state that findings are informational only.",
          model: "haiku",
        },
      },

      // Bypass permissions for automated workflow
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,

      // Trace hooks for observability
      hooks: {
        PreToolUse: [{ hooks: [preToolUseHook] }],
        PostToolUse: [{ hooks: [postToolUseHook] }],
      },
    },
  });

  for await (const message of q) {
    // Capture session ID from init message
    if (message.type === "system" && "subtype" in message) {
      if (message.subtype === "init") {
        const initMsg = message as SDKMessage & {
          session_id: string;
          model: string;
          tools: string[];
        };
        sessionId = initMsg.session_id;
        addStep(traceId, {
          actor: "secretary",
          event: "AGENT_SDK_SESSION_START",
          ok: true,
          data: {
            sessionId: initMsg.session_id,
            model: initMsg.model,
            tools: initMsg.tools,
          },
        });
      }
    }

    // Track assistant messages for tool call log
    if (message.type === "assistant") {
      const assistantMsg = message as SDKMessage & {
        message: { content: Array<Record<string, unknown>> };
      };
      if (assistantMsg.message?.content) {
        for (const block of assistantMsg.message.content) {
          if (block.type === "tool_use") {
            const toolName = (block.name as string).replace(
              /^mcp__healthcare__/,
              ""
            );
            toolCallLog.push({
              tool: toolName,
              args: (block.input as Record<string, unknown>) || {},
              result: {},
            });
          }
          if (block.type === "text" && block.text) {
            finalDecision = block.text as string;
          }
        }
      }
    }

    // Capture the final result
    if (message.type === "result") {
      const resultMsg = message as SDKMessage & {
        subtype: string;
        num_turns: number;
        result?: string;
        total_cost_usd?: number;
        duration_ms?: number;
        errors?: string[];
      };

      turns = resultMsg.num_turns;
      costUsd = resultMsg.total_cost_usd;

      if (resultMsg.subtype === "success") {
        finalDecision = resultMsg.result || finalDecision;
        addStep(traceId, {
          actor: "secretary",
          event: "AGENT_SDK_RESULT",
          ok: true,
          data: {
            duration_ms: resultMsg.duration_ms,
            cost_usd: resultMsg.total_cost_usd,
            turns: resultMsg.num_turns,
          },
        });
      } else {
        addStep(traceId, {
          actor: "secretary",
          event: "AGENT_SDK_ERROR",
          ok: false,
          data: {
            subtype: resultMsg.subtype,
            errors: resultMsg.errors,
          },
        });
        if (!finalDecision && toolCallLog.length > 0) {
          finalDecision = buildFallbackSummary(toolCallLog);
        } else if (!finalDecision) {
          finalDecision = `Agent SDK ended with: ${resultMsg.subtype}`;
        }
      }
    }
  }

  return {
    finalDecision:
      finalDecision || "Workflow complete (no summary provided).",
    turns,
    sessionId,
    costUsd,
  };
}

/* ------------------------------------------------------------------ */
/*  Fallback summary from tool results (when LLM fails mid-workflow)   */
/* ------------------------------------------------------------------ */

function buildFallbackSummary(toolCallLog: ToolCallLogEntry[]): string {
  const parts: string[] = [
    "[Secretary fallback — LLM unavailable for final summary]\n",
  ];

  for (const tc of toolCallLog) {
    parts.push(`Tool: ${tc.tool}`);
    const r = tc.result;
    if (tc.tool === "analyze_anomaly" && !r.error) {
      parts.push(`  Urgency: ${r.urgency || "unknown"}`);
      parts.push(
        `  Should contact clinic: ${r.should_contact_clinic ?? "unknown"}`
      );
      parts.push(`  Summary: ${r.summary_explanation || "N/A"}`);
      parts.push(`  Recommended: ${r.recommended_next_step || "N/A"}`);
    } else if (tc.tool === "triage_patient" && !r.error) {
      parts.push(
        `  Appointment booked: ${r.booking_confirmation ? "yes" : "no"}`
      );
      parts.push(`  Urgency: ${r.urgency || "unknown"}`);
      parts.push(`  Escalation: ${r.escalation_triggered ?? "unknown"}`);
    } else if (tc.tool === "get_health_summary" && !r.error) {
      parts.push(`  Range: ${r.rangeDays || "?"} days`);
      if (r.notes && Array.isArray(r.notes)) {
        parts.push(`  Notes: ${(r.notes as string[]).join("; ")}`);
      }
    } else if (r.error) {
      parts.push(`  Error: ${r.message || JSON.stringify(r)}`);
    } else {
      parts.push(`  Result: ${JSON.stringify(r).slice(0, 200)}`);
    }
    parts.push("");
  }

  return parts.join("\n");
}

/* ------------------------------------------------------------------ */
/*  Deterministic fallback (no API key)                                */
/* ------------------------------------------------------------------ */

function deterministicFallback(userMessage: string): string {
  const scoreMatch = userMessage.match(/"anomaly_score"\s*:\s*(\d+)/);
  const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 0;

  if (score >= 70) {
    return (
      "[Deterministic] High anomaly score detected (" +
      score +
      "/100). Recommend immediate clinic contact and triage. " +
      "Unable to run full workflow without LLM API key."
    );
  }
  if (score >= 40) {
    return (
      "[Deterministic] Moderate anomaly score detected (" +
      score +
      "/100). Recommend scheduling a follow-up appointment soon. " +
      "Unable to run full workflow without LLM API key."
    );
  }
  return (
    "[Deterministic] Low anomaly score (" +
    score +
    "/100). Continue monitoring. " +
    "Unable to run full workflow without LLM API key."
  );
}
