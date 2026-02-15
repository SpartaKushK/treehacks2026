/**
 * Secretary Agent — Core Agent Loop
 *
 * Implements an LLM agent loop using native function-calling (tool use)
 * for both OpenAI and Anthropic. The loop:
 *
 *   1. Sends trigger data + system prompt + tool definitions to the LLM
 *   2. If the LLM responds with tool_calls → execute tools, feed results back
 *   3. If the LLM responds with text → workflow is done, return final decision
 *   4. Repeat up to MAX_ITERATIONS
 */

import { SECRETARY_SYSTEM_PROMPT } from "./prompts";
import {
  toOpenAITools,
  toAnthropicTools,
  executeTool,
  type ToolContext,
} from "./tools";
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
  /** LLM provider to use */
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
}

interface ToolCallLogEntry {
  tool: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
}

const MAX_ITERATIONS = 10;
const RATE_LIMIT_DELAY_MS = 21_000; // 21s pause between LLM calls (free tier: 3 RPM)

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ------------------------------------------------------------------ */
/*  Main entry point                                                   */
/* ------------------------------------------------------------------ */

export async function runSecretary(input: SecretaryInput): Promise<SecretaryResult> {
  const { triggerData, provider, triggerDescription } = input;

  // Resolve the user handle for memory scoping
  const userHandle = (triggerData.user_handle as string) || "unknown";

  // Start a trace for observability
  const traceId = startTrace({
    provider,
    title: `Secretary: ${triggerDescription || "health trigger"}`,
  });

  const toolCtx: ToolContext = { traceId, provider, triggerData };
  const toolCallLog: ToolCallLogEntry[] = [];

  addStep(traceId, {
    actor: "secretary",
    event: "WORKFLOW_START",
    ok: true,
    data: { triggerData, provider },
  });

  // Build the user message from the trigger
  const userMessage =
    triggerDescription
      ? `${triggerDescription}\n\nTrigger data:\n${JSON.stringify(triggerData, null, 2)}`
      : `New health trigger received:\n${JSON.stringify(triggerData, null, 2)}`;

  // ── Load conversation history for this user's secretary agent ──
  let priorHistory: Array<{ role: "user" | "assistant"; content: string }> = [];
  try {
    const rawHistory = await getHistory("secretary", userHandle);
    priorHistory = formatHistoryForLLM(rawHistory, 40);
    if (priorHistory.length > 0) {
      addStep(traceId, {
        actor: "secretary",
        event: "MEMORY_LOADED",
        ok: true,
        data: { messageCount: priorHistory.length, userHandle },
      });
    }
  } catch (e) {
    console.warn("[Secretary] Failed to load memory, proceeding without:", e);
  }

  let finalDecision: string;
  let turns: number;

  if (provider === "openai") {
    const result = await runOpenAILoop(userMessage, toolCtx, toolCallLog, priorHistory);
    finalDecision = result.finalDecision;
    turns = result.turns;
  } else {
    const result = await runAnthropicLoop(userMessage, toolCtx, toolCallLog, priorHistory);
    finalDecision = result.finalDecision;
    turns = result.turns;
  }

  // ── Save this interaction to memory ──
  try {
    await saveInteraction(
      "secretary",
      userHandle,
      userMessage,
      finalDecision,
      { provider, turns, toolCallsCount: toolCallLog.length },
    );
    // Also save individual tool interactions
    for (const tc of toolCallLog) {
      await saveToolInteraction("secretary", userHandle, tc.tool, tc.args, tc.result);
    }
  } catch (e) {
    console.warn("[Secretary] Failed to save memory:", e);
  }

  addStep(traceId, {
    actor: "secretary",
    event: "WORKFLOW_COMPLETE",
    ok: true,
    data: {
      finalDecision,
      toolCallsCount: toolCallLog.length,
      turns,
    },
  });

  await finalizeTrace(traceId);

  return { traceId, finalDecision, toolCallLog, provider, turns };
}

/* ------------------------------------------------------------------ */
/*  OpenAI Loop                                                        */
/* ------------------------------------------------------------------ */

interface LoopResult {
  finalDecision: string;
  turns: number;
}

async function runOpenAILoop(
  userMessage: string,
  ctx: ToolContext,
  toolCallLog: ToolCallLogEntry[],
  priorHistory: Array<{ role: "user" | "assistant"; content: string }> = [],
): Promise<LoopResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      finalDecision: deterministicFallback(userMessage),
      turns: 1,
    };
  }

  // OpenAI message history — inject prior conversation history
  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: SECRETARY_SYSTEM_PROMPT },
    // Inject prior conversation history for context continuity
    ...priorHistory.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: userMessage },
  ];

  const tools = toOpenAITools();

  for (let turn = 0; turn < MAX_ITERATIONS; turn++) {
    // Rate-limit pause between LLM calls (skip on first turn)
    if (turn > 0) {
      addStep(ctx.traceId, {
        actor: "secretary",
        event: "RATE_LIMIT_PAUSE",
        ok: true,
        provider: "openai",
        data: { delayMs: RATE_LIMIT_DELAY_MS, turn },
      });
      await sleep(RATE_LIMIT_DELAY_MS);
    }

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages,
        tools,
        tool_choice: "auto",
        max_tokens: 1024,
      }),
    });

    const data = await res.json();

    // Check for API-level errors (rate limit, auth, etc.)
    if (data.error) {
      console.error("[Secretary/OpenAI] API error:", data.error);
      addStep(ctx.traceId, {
        actor: "secretary",
        event: "LLM_API_ERROR",
        ok: false,
        provider: "openai",
        data: { error: data.error },
      });
      // If we already have tool results, summarize what we have
      if (toolCallLog.length > 0) {
        return {
          finalDecision: buildFallbackSummary(toolCallLog),
          turns: turn + 1,
        };
      }
      return { finalDecision: `LLM error: ${data.error.message || JSON.stringify(data.error)}`, turns: turn + 1 };
    }

    const choice = data.choices?.[0];
    if (!choice) {
      console.error("[Secretary/OpenAI] No choices in response:", JSON.stringify(data).slice(0, 500));
      if (toolCallLog.length > 0) {
        return {
          finalDecision: buildFallbackSummary(toolCallLog),
          turns: turn + 1,
        };
      }
      return { finalDecision: "Error: No response from LLM", turns: turn + 1 };
    }

    const assistantMessage = choice.message;
    messages.push(assistantMessage);

    // If there are tool calls, execute them
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      for (const toolCall of assistantMessage.tool_calls) {
        const fnName = toolCall.function.name;
        let fnArgs: Record<string, unknown>;
        try {
          fnArgs = JSON.parse(toolCall.function.arguments);
        } catch {
          fnArgs = {};
        }

        addStep(ctx.traceId, {
          actor: "secretary",
          event: "TOOL_CALL",
          ok: true,
          provider: "openai",
          data: { tool: fnName, args: fnArgs },
        });

        // Execute the tool
        const result = await executeTool(fnName, fnArgs, ctx);

        addStep(ctx.traceId, {
          actor: fnName,
          event: "TOOL_RESULT",
          ok: !result.error,
          provider: "openai",
          data: result,
        });

        toolCallLog.push({ tool: fnName, args: fnArgs, result });

        // Feed result back to OpenAI as a tool response
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }
      // Continue the loop — LLM will process tool results
      continue;
    }

    // No tool calls — LLM returned a final text response
    const finalText =
      assistantMessage.content || "Workflow complete (no summary provided).";
    return { finalDecision: finalText, turns: turn + 1 };
  }

  return {
    finalDecision: "Secretary reached maximum iterations without a final decision.",
    turns: MAX_ITERATIONS,
  };
}

/* ------------------------------------------------------------------ */
/*  Anthropic Loop                                                     */
/* ------------------------------------------------------------------ */

async function runAnthropicLoop(
  userMessage: string,
  ctx: ToolContext,
  toolCallLog: ToolCallLogEntry[],
  priorHistory: Array<{ role: "user" | "assistant"; content: string }> = [],
): Promise<LoopResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      finalDecision: deterministicFallback(userMessage),
      turns: 1,
    };
  }

  // Anthropic message history — inject prior conversation history
  const messages: Array<Record<string, unknown>> = [
    // Inject prior conversation history for context continuity
    ...priorHistory.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: userMessage },
  ];

  const tools = toAnthropicTools();

  for (let turn = 0; turn < MAX_ITERATIONS; turn++) {
    // Rate-limit pause between LLM calls (skip on first turn)
    if (turn > 0) {
      addStep(ctx.traceId, {
        actor: "secretary",
        event: "RATE_LIMIT_PAUSE",
        ok: true,
        provider: "claude",
        data: { delayMs: RATE_LIMIT_DELAY_MS, turn },
      });
      await sleep(RATE_LIMIT_DELAY_MS);
    }

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 1024,
        system: SECRETARY_SYSTEM_PROMPT,
        messages,
        tools,
      }),
    });

    const data = await res.json();

    // Check for API-level errors
    if (data.error || data.type === "error") {
      console.error("[Secretary/Anthropic] API error:", data.error || data);
      addStep(ctx.traceId, {
        actor: "secretary",
        event: "LLM_API_ERROR",
        ok: false,
        provider: "claude",
        data: { error: data.error || data },
      });
      if (toolCallLog.length > 0) {
        return {
          finalDecision: buildFallbackSummary(toolCallLog),
          turns: turn + 1,
        };
      }
      return { finalDecision: `LLM error: ${data.error?.message || JSON.stringify(data)}`, turns: turn + 1 };
    }

    if (!data.content || data.content.length === 0) {
      console.error("[Secretary/Anthropic] No content in response:", JSON.stringify(data).slice(0, 500));
      if (toolCallLog.length > 0) {
        return {
          finalDecision: buildFallbackSummary(toolCallLog),
          turns: turn + 1,
        };
      }
      return { finalDecision: "Error: No response from LLM", turns: turn + 1 };
    }

    // Anthropic can return mixed content blocks (text + tool_use)
    const textBlocks: string[] = [];
    const toolUseBlocks: Array<{
      id: string;
      name: string;
      input: Record<string, unknown>;
    }> = [];

    for (const block of data.content) {
      if (block.type === "text") {
        textBlocks.push(block.text);
      } else if (block.type === "tool_use") {
        toolUseBlocks.push({
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        });
      }
    }

    // If there are tool calls, execute them
    if (toolUseBlocks.length > 0) {
      // Add assistant message with tool use to history
      messages.push({ role: "assistant", content: data.content });

      // Build tool results
      const toolResults: Array<Record<string, unknown>> = [];

      for (const toolUse of toolUseBlocks) {
        addStep(ctx.traceId, {
          actor: "secretary",
          event: "TOOL_CALL",
          ok: true,
          provider: "claude",
          data: { tool: toolUse.name, args: toolUse.input },
        });

        const result = await executeTool(toolUse.name, toolUse.input, ctx);

        addStep(ctx.traceId, {
          actor: toolUse.name,
          event: "TOOL_RESULT",
          ok: !result.error,
          provider: "claude",
          data: result,
        });

        toolCallLog.push({ tool: toolUse.name, args: toolUse.input, result });

        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: JSON.stringify(result),
        });
      }

      // Feed tool results back to Anthropic
      messages.push({ role: "user", content: toolResults });
      continue;
    }

    // No tool calls — LLM returned a final text response
    const finalText = textBlocks.join("\n") || "Workflow complete (no summary provided).";

    // Check stop reason — if "end_turn" we're done
    if (data.stop_reason === "end_turn" || data.stop_reason === "stop_sequence") {
      return { finalDecision: finalText, turns: turn + 1 };
    }

    // Default: treat text-only response as final
    return { finalDecision: finalText, turns: turn + 1 };
  }

  return {
    finalDecision: "Secretary reached maximum iterations without a final decision.",
    turns: MAX_ITERATIONS,
  };
}

/* ------------------------------------------------------------------ */
/*  Fallback summary from tool results (when LLM fails mid-workflow)   */
/* ------------------------------------------------------------------ */

function buildFallbackSummary(toolCallLog: ToolCallLogEntry[]): string {
  const parts: string[] = ["[Secretary fallback — LLM unavailable for final summary]\n"];

  for (const tc of toolCallLog) {
    parts.push(`Tool: ${tc.tool}`);
    const r = tc.result;
    if (tc.tool === "analyze_anomaly" && !r.error) {
      parts.push(`  Urgency: ${r.urgency || "unknown"}`);
      parts.push(`  Should contact clinic: ${r.should_contact_clinic ?? "unknown"}`);
      parts.push(`  Summary: ${r.summary_explanation || "N/A"}`);
      parts.push(`  Recommended: ${r.recommended_next_step || "N/A"}`);
    } else if (tc.tool === "triage_patient" && !r.error) {
      parts.push(`  Appointment booked: ${r.booking_confirmation ? "yes" : "no"}`);
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
  // Parse out anomaly score if present
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
