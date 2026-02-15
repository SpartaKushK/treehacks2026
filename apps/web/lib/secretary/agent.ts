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
import { toOpenAITools, executeTool } from "./tools";
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

  // Build the user message from the trigger
  const userMessage = triggerDescription
    ? `${triggerDescription}\n\nTrigger data:\n${JSON.stringify(triggerData, null, 2)}`
    : `New health trigger received:\n${JSON.stringify(triggerData, null, 2)}`;

  // Prefer requested provider; if its key is missing, try the other LLM before giving up
  const claudeKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const useClaude = input.provider === "claude" ? !!claudeKey : !openaiKey && !!claudeKey;
  const useOpenAI = !useClaude && !!openaiKey;

  if (!useClaude && !useOpenAI) {
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

  const effectiveProvider: "openai" | "claude" = useClaude ? "claude" : "openai";
  addStep(traceId, {
    actor: "secretary",
    event: "WORKFLOW_START",
    ok: true,
    data: { triggerData, provider: effectiveProvider, sdk: useClaude ? "claude-agent-sdk" : "openai" },
  });

  // Set context for MCP tools and hooks (and OpenAI tool execution)
  setActiveContext({ traceId, provider: effectiveProvider, triggerData });

  try {
    const result = useClaude
      ? await runAgentSDKLoop(userMessage, traceId, toolCallLog)
      : await runOpenAILoop(userMessage, traceId, toolCallLog, triggerData);

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
        { provider: effectiveProvider, turns: result.turns, toolCallsCount: toolCallLog.length },
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
      provider: effectiveProvider,
      turns: result.turns,
      sessionId: result.sessionId,
      costUsd: result.costUsd,
    };
  } catch (err) {
    console.error("[Secretary] Error:", err);
    const fallback =
      toolCallLog.length > 0
        ? buildFallbackSummary(toolCallLog)
        : `Agent error: ${err instanceof Error ? err.message : String(err)}`;

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
      provider: effectiveProvider,
      turns: 0,
    };
  } finally {
    setActiveContext(null);
  }
}

/* ------------------------------------------------------------------ */
/*  OpenAI tool-calling loop (fallback when Claude key missing)        */
/* ------------------------------------------------------------------ */

interface AgentLoopResult {
  finalDecision: string;
  turns: number;
  sessionId?: string;
  costUsd?: number;
}

async function runOpenAILoop(
  userMessage: string,
  traceId: string,
  toolCallLog: ToolCallLogEntry[],
  triggerData: Record<string, unknown>,
): Promise<AgentLoopResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      finalDecision: "OpenAI API key not configured.",
      turns: 0,
    };
  }

  const tools = toOpenAITools();
  const ctx = { traceId, provider: "openai" as const, triggerData };
  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: SECRETARY_SYSTEM_PROMPT },
    { role: "user", content: userMessage },
  ];
  let turns = 0;
  const maxTurns = 15;
  let requestFinalSummary = false;

  while (turns < maxTurns) {
    turns++;
    const body: Record<string, unknown> = {
      model: "gpt-4o-mini",
      messages,
      max_tokens: 4096,
    };
    if (tools.length) {
      body.tools = tools;
      body.tool_choice = requestFinalSummary ? "none" : "auto";
    }
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    const msg = data.choices?.[0]?.message;
    if (!msg) {
      const err = data.error?.message || JSON.stringify(data);
      return {
        finalDecision: toolCallLog.length > 0 ? buildFallbackSummary(toolCallLog) : `OpenAI error: ${err}`,
        turns,
      };
    }

    const content = typeof msg.content === "string" ? msg.content : msg.content?.[0]?.text ?? "";
    const toolCalls = msg.tool_calls || [];

    if (toolCalls.length === 0) {
      return {
        finalDecision: content || "Workflow complete (no summary provided).",
        turns,
      };
    }

    messages.push({
      role: "assistant",
      content: content || null,
      tool_calls: toolCalls.map((tc: { id: string; function: { name: string; arguments: string } }) => ({
        id: tc.id,
        type: "function",
        function: { name: tc.function?.name || "", arguments: tc.function?.arguments || "{}" },
      })),
    });

    for (const tc of toolCalls) {
      const id = tc.id;
      const name = tc.function?.name || "";
      const argsStr = tc.function?.arguments || "{}";
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(argsStr);
      } catch {
        args = {};
      }
      addStep(traceId, {
        actor: "secretary",
        event: "TOOL_CALL",
        ok: true,
        data: { tool: name, args },
      });
      const result = await executeTool(name, args, ctx);
      toolCallLog.push({ tool: name, args, result });
      messages.push({
        role: "tool",
        tool_call_id: id,
        content: JSON.stringify(result),
      });
    }

    // Force a final text-only response next turn (tool_choice: "none" set above on next iteration)
    messages.push({
      role: "user",
      content:
        "Based on the tool results above, provide a concise final summary for the care team. Do not call any additional tools.",
    });
    requestFinalSummary = true;
  }

  return {
    finalDecision: toolCallLog.length > 0 ? buildFallbackSummary(toolCallLog) : "Max turns reached.",
    turns,
  };
}

/* ------------------------------------------------------------------ */
/*  Agent SDK Loop (Claude)                                            */
/* ------------------------------------------------------------------ */

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
        "mcp__healthcare__notify_doctor_agent",
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
