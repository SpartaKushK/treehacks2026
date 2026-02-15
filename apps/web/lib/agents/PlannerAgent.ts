/**
 * Planner Agent — Main orchestrator for the hierarchical agent architecture
 *
 * The Planner is the top-level decision maker that delegates work to
 * specialized sub-agents (HealthAgent, SchedulerAgent) and coordinates
 * their interactions through an LLM-powered agentic loop.
 *
 * Memory scope: "planner" per user
 */

import { Agent } from "./base/Agent";
import type {
  AgentConfig,
  AgentContext,
  AgentResult,
  ToolDefinition,
  ToolContext,
} from "./base/types";
import { HealthAgent } from "./HealthAgent";
import { SchedulerAgent } from "./SchedulerAgent";
import { startTrace, addStep, finalizeTrace } from "../trace";
import { extractUserHandle, buildToolCallSummary, sleep } from "./base/utils";

const MAX_ITERATIONS = 10;
const RATE_LIMIT_DELAY_MS = 21_000; // 21s pause between LLM calls (free tier: 3 RPM)

interface ToolCallLogEntry {
  tool: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
}

export class PlannerAgent extends Agent {
  private healthAgent: HealthAgent;
  private schedulerAgent: SchedulerAgent;

  constructor(config?: Partial<AgentConfig>) {
    const fullConfig: AgentConfig = {
      agentType: "planner",
      systemPrompt: PLANNER_SYSTEM_PROMPT,
      provider: config?.provider || "claude",
      ...config,
    };

    // Instantiate sub-agents
    const healthAgent = new HealthAgent({ provider: fullConfig.provider });
    const schedulerAgent = new SchedulerAgent({ provider: fullConfig.provider });

    // Define delegation tools (these will be exposed to the LLM)
    const tools = buildDelegationTools(healthAgent, schedulerAgent);

    super(fullConfig, tools);

    this.healthAgent = healthAgent;
    this.schedulerAgent = schedulerAgent;
  }

  /**
   * Main entry point for the Planner Agent.
   * Runs an LLM loop with tool calling, delegating to sub-agents as needed.
   */
  async run(
    input: Record<string, unknown>,
    context: AgentContext,
  ): Promise<AgentResult> {
    const userHandle = extractUserHandle(input);
    const provider = context.provider || this.config.provider || "claude";

    // Start a trace for observability
    const traceId = context.traceId || startTrace({
      provider,
      title: `Planner: ${input.description || "health trigger"}`,
    });

    addStep(traceId, {
      actor: "planner",
      event: "WORKFLOW_START",
      ok: true,
      data: { input, provider },
    });

    // Build the user message from the trigger
    const userMessage = buildUserMessage(input);

    // Load conversation history for this user's planner agent
    let priorHistory: Array<{ role: "user" | "assistant"; content: string }> = [];
    try {
      priorHistory = await this.loadHistory(userHandle, 40);
      if (priorHistory.length > 0) {
        addStep(traceId, {
          actor: "planner",
          event: "MEMORY_LOADED",
          ok: true,
          data: { messageCount: priorHistory.length, userHandle },
        });
      }
    } catch (e) {
      console.warn("[PlannerAgent] Failed to load memory, proceeding without:", e);
    }

    // Build tool context
    const toolCtx: ToolContext = {
      traceId,
      provider,
      triggerData: input,
      userHandle,
      parentAgent: "planner",
    };

    const toolCallLog: ToolCallLogEntry[] = [];
    let finalDecision: string;
    let turns: number;

    // Run the appropriate LLM loop
    if (provider === "openai") {
      const result = await this.runOpenAILoop(
        userMessage,
        toolCtx,
        toolCallLog,
        priorHistory,
      );
      finalDecision = result.finalDecision;
      turns = result.turns;
    } else {
      const result = await this.runAnthropicLoop(
        userMessage,
        toolCtx,
        toolCallLog,
        priorHistory,
      );
      finalDecision = result.finalDecision;
      turns = result.turns;
    }

    // Save this interaction to planner's memory
    try {
      await this.saveToMemory(
        userHandle,
        userMessage,
        finalDecision,
        {
          provider,
          turns,
          toolCallsCount: toolCallLog.length,
          traceId,
        },
      );

      // Also save individual tool interactions
      for (const tc of toolCallLog) {
        await this.saveToolToMemory(userHandle, tc.tool, tc.args, tc.result);
      }
    } catch (e) {
      console.warn("[PlannerAgent] Failed to save memory:", e);
    }

    addStep(traceId, {
      actor: "planner",
      event: "WORKFLOW_COMPLETE",
      ok: true,
      data: {
        finalDecision,
        toolCallsCount: toolCallLog.length,
        turns,
      },
    });

    await finalizeTrace(traceId);

    return {
      ok: true,
      data: {
        finalDecision,
        toolCallLog,
        provider,
        turns,
      },
      traceId,
      turns,
      toolCalls: toolCallLog,
    };
  }

  /* ------------------------------------------------------------------ */
  /*  OpenAI Loop                                                        */
  /* ------------------------------------------------------------------ */

  private async runOpenAILoop(
    userMessage: string,
    ctx: ToolContext,
    toolCallLog: ToolCallLogEntry[],
    priorHistory: Array<{ role: "user" | "assistant"; content: string }> = [],
  ): Promise<{ finalDecision: string; turns: number }> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return {
        finalDecision: deterministicFallback(userMessage),
        turns: 1,
      };
    }

    // OpenAI message history — inject prior conversation history
    const messages: Array<Record<string, unknown>> = [
      { role: "system", content: this.config.systemPrompt },
      ...priorHistory.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: userMessage },
    ];

    const tools = toOpenAITools(this.tools);

    for (let turn = 0; turn < MAX_ITERATIONS; turn++) {
      // Rate-limit pause between LLM calls (skip on first turn)
      if (turn > 0) {
        addStep(ctx.traceId, {
          actor: "planner",
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

      // Check for API-level errors
      if (data.error) {
        console.error("[PlannerAgent/OpenAI] API error:", data.error);
        addStep(ctx.traceId, {
          actor: "planner",
          event: "LLM_API_ERROR",
          ok: false,
          provider: "openai",
          data: { error: data.error },
        });
        if (toolCallLog.length > 0) {
          return {
            finalDecision: buildToolCallSummary(toolCallLog),
            turns: turn + 1,
          };
        }
        return {
          finalDecision: `LLM error: ${data.error.message || JSON.stringify(data.error)}`,
          turns: turn + 1,
        };
      }

      const choice = data.choices?.[0];
      if (!choice) {
        console.error("[PlannerAgent/OpenAI] No choices in response");
        if (toolCallLog.length > 0) {
          return {
            finalDecision: buildToolCallSummary(toolCallLog),
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
            actor: "planner",
            event: "TOOL_CALL",
            ok: true,
            provider: "openai",
            data: { tool: fnName, args: fnArgs },
          });

          // Execute the tool
          const result = await this.executeTool(fnName, fnArgs, ctx);

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
      finalDecision: "Planner reached maximum iterations without a final decision.",
      turns: MAX_ITERATIONS,
    };
  }

  /* ------------------------------------------------------------------ */
  /*  Anthropic Loop                                                     */
  /* ------------------------------------------------------------------ */

  private async runAnthropicLoop(
    userMessage: string,
    ctx: ToolContext,
    toolCallLog: ToolCallLogEntry[],
    priorHistory: Array<{ role: "user" | "assistant"; content: string }> = [],
  ): Promise<{ finalDecision: string; turns: number }> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return {
        finalDecision: deterministicFallback(userMessage),
        turns: 1,
      };
    }

    // Anthropic message history — inject prior conversation history
    const messages: Array<Record<string, unknown>> = [
      ...priorHistory.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: userMessage },
    ];

    const tools = toAnthropicTools(this.tools);

    for (let turn = 0; turn < MAX_ITERATIONS; turn++) {
      // Rate-limit pause between LLM calls (skip on first turn)
      if (turn > 0) {
        addStep(ctx.traceId, {
          actor: "planner",
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
          system: this.config.systemPrompt,
          messages,
          tools,
        }),
      });

      const data = await res.json();

      // Check for API-level errors
      if (data.error || data.type === "error") {
        console.error("[PlannerAgent/Anthropic] API error:", data.error || data);
        addStep(ctx.traceId, {
          actor: "planner",
          event: "LLM_API_ERROR",
          ok: false,
          provider: "claude",
          data: { error: data.error || data },
        });
        if (toolCallLog.length > 0) {
          return {
            finalDecision: buildToolCallSummary(toolCallLog),
            turns: turn + 1,
          };
        }
        return {
          finalDecision: `LLM error: ${data.error?.message || JSON.stringify(data)}`,
          turns: turn + 1,
        };
      }

      if (!data.content || data.content.length === 0) {
        console.error("[PlannerAgent/Anthropic] No content in response");
        if (toolCallLog.length > 0) {
          return {
            finalDecision: buildToolCallSummary(toolCallLog),
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
            actor: "planner",
            event: "TOOL_CALL",
            ok: true,
            provider: "claude",
            data: { tool: toolUse.name, args: toolUse.input },
          });

          const result = await this.executeTool(toolUse.name, toolUse.input, ctx);

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
      finalDecision: "Planner reached maximum iterations without a final decision.",
      turns: MAX_ITERATIONS,
    };
  }

  /* ------------------------------------------------------------------ */
  /*  Tool Execution                                                     */
  /* ------------------------------------------------------------------ */

  private async executeTool(
    name: string,
    args: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<Record<string, unknown>> {
    const tool = this.tools.find((t) => t.name === name);
    if (!tool) {
      return { error: true, message: `Unknown tool: ${name}` };
    }
    return tool.execute(args, ctx);
  }
}

/* ------------------------------------------------------------------ */
/*  Build Delegation Tools                                             */
/* ------------------------------------------------------------------ */

function buildDelegationTools(
  healthAgent: HealthAgent,
  schedulerAgent: SchedulerAgent,
): ToolDefinition[] {
  return [
    {
      name: "analyze_health",
      description:
        "Delegate health anomaly analysis to the Health Agent. " +
        "Evaluates severity, determines urgency, and decides whether the " +
        "patient should contact a clinic. Returns a structured decision.",
      parameters: {
        type: "object",
        properties: {
          user_handle: { type: "string", description: "Patient's handle" },
          date: { type: "string", description: "ISO date of anomaly" },
          anomaly_score: {
            type: "number",
            description: "Anomaly score from 0-100",
          },
          metrics: {
            type: "object",
            description: "Current health metrics from wearable",
          },
          baseline: {
            type: "object",
            description: "Baseline statistics for comparison",
          },
          flags: {
            type: "array",
            items: { type: "string" },
            description: "List of anomaly flags",
          },
        },
        required: ["user_handle", "date", "anomaly_score", "metrics", "baseline", "flags"],
      },
      async execute(args, ctx) {
        const context: AgentContext = {
          traceId: ctx.traceId,
          provider: ctx.provider,
          userHandle: ctx.userHandle || (args.user_handle as string) || "unknown",
          triggerData: ctx.triggerData,
          parentAgent: ctx.parentAgent,
        };
        const result = await healthAgent.analyzeAnomaly(args, context);
        return result.data;
      },
    },
    {
      name: "get_health_summary",
      description:
        "Retrieve a 30-day health summary from the Health Agent. " +
        "Includes sleep, activity, medication adherence, and symptom trends.",
      parameters: {
        type: "object",
        properties: {
          patient_handle: { type: "string", description: "Patient's handle" },
        },
        required: ["patient_handle"],
      },
      async execute(args, ctx) {
        const context: AgentContext = {
          traceId: ctx.traceId,
          provider: ctx.provider,
          userHandle: ctx.userHandle || (args.patient_handle as string) || "unknown",
          triggerData: ctx.triggerData,
          parentAgent: ctx.parentAgent,
        };
        const result = await healthAgent.getHealthSummary(args, context);
        return result.data;
      },
    },
    {
      name: "schedule_appointment",
      description:
        "Delegate appointment scheduling to the Scheduler Agent. " +
        "Checks Google Calendar for conflicts, finds free slots, and books " +
        "the best available time based on urgency.",
      parameters: {
        type: "object",
        properties: {
          user_handle: { type: "string", description: "User's handle" },
          title: { type: "string", description: "Appointment title" },
          urgency: {
            type: "string",
            enum: ["routine", "soon", "urgent"],
            description: "Urgency level",
          },
          duration_mins: { type: "number", description: "Duration in minutes" },
          method: {
            type: "string",
            enum: ["in_person", "telehealth"],
            description: "Appointment method",
          },
          description: { type: "string", description: "Optional description" },
        },
        required: ["user_handle", "title", "urgency"],
      },
      async execute(args, ctx) {
        const context: AgentContext = {
          traceId: ctx.traceId,
          provider: ctx.provider,
          userHandle: ctx.userHandle || (args.user_handle as string) || "unknown",
          triggerData: ctx.triggerData,
          parentAgent: ctx.parentAgent,
        };
        const result = await schedulerAgent.scheduleAppointment(args, context);
        return result.data;
      },
    },
  ];
}

/* ------------------------------------------------------------------ */
/*  System Prompt                                                      */
/* ------------------------------------------------------------------ */

const PLANNER_SYSTEM_PROMPT = `You are a Planner Agent — the central orchestrator for a patient's health management system.

## Your Role
You receive incoming health data triggers (from wearables, health apps, manual reports) and manage the appropriate response workflow. You are the DECISION MAKER, not the calculator. You NEVER perform medical analysis, scoring, or calculations yourself. You ALWAYS delegate domain-specific work to your specialized sub-agents.

## Available Sub-Agents (via Tools)

### 1. analyze_health (Health Agent)
Delegates to the Health Agent for anomaly analysis. It evaluates severity, determines urgency, and recommends whether the patient should contact a clinic. Use this as your FIRST step when you receive health alert data.

### 2. get_health_summary (Health Agent)
Retrieves a 30-day health summary for context. Includes sleep, activity, medication adherence, and symptom trends. Use this when you need historical health data to inform decisions.

### 3. schedule_appointment (Scheduler Agent)
Delegates to the Scheduler Agent for all calendar operations:
- Checks the user's real Google Calendar for existing events and conflicts
- Finds genuinely free time slots based on urgency (urgent=today, soon=1-2 days, routine=3+ days)
- Books the best available slot
- Creates the event on Google Calendar (if connected) or saves locally

## Decision-Making Guidelines

### Priority Evaluation
1. When you receive a trigger, first determine what type of data it is (anomaly alert, routine check, etc.)
2. ALWAYS use analyze_health first for any health alert data — do not assess severity yourself
3. Based on the health analysis result:
   - If **should_contact_clinic = true**: proceed to schedule_appointment to book
   - If **urgency = "urgent"**: schedule_appointment with urgency="urgent"
   - If **urgency = "soon"**: schedule_appointment with urgency="soon"
   - If **urgency = "routine"**: summarize findings and recommend follow-up, no immediate scheduling needed

### Chaining Rules
- You may call multiple tools in sequence based on results
- Always pass relevant context from one tool's output to the next tool's input
- The typical chain for health alerts is: analyze_health → schedule_appointment (if needed)

### Final Response
When you've gathered enough information or completed the workflow, provide a final summary that includes:
- What triggered the workflow
- What actions were taken (which sub-agents were consulted)
- The outcome (appointment booked, monitoring recommended, etc.)
- Any follow-up recommendations

## Important Rules
- NEVER diagnose or assess severity yourself — always delegate to your sub-agents
- NEVER fabricate health data or tool results
- If a tool returns an error, report it clearly — do not retry more than once
- Keep your reasoning concise — focus on delegation and decision-making
- Always include the patient's handle when calling tools
- Remember that each sub-agent has its own memory and context — they maintain continuity across conversations`;

/* ------------------------------------------------------------------ */
/*  Helper Functions                                                   */
/* ------------------------------------------------------------------ */

function buildUserMessage(input: Record<string, unknown>): string {
  const description = input.description as string | undefined;
  return description
    ? `${description}\n\nTrigger data:\n${JSON.stringify(input, null, 2)}`
    : `New health trigger received:\n${JSON.stringify(input, null, 2)}`;
}

function toOpenAITools(tools: ToolDefinition[]) {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

function toAnthropicTools(tools: ToolDefinition[]) {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));
}

function deterministicFallback(userMessage: string): string {
  const scoreMatch = userMessage.match(/"anomaly_score"\s*:\s*(\d+)/);
  const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 0;

  if (score >= 70) {
    return `[Deterministic fallback] High anomaly score detected (${score}/100). Recommend immediate clinic contact. Unable to run full workflow without LLM API key.`;
  }
  if (score >= 40) {
    return `[Deterministic fallback] Moderate anomaly score detected (${score}/100). Recommend scheduling a follow-up appointment soon. Unable to run full workflow without LLM API key.`;
  }
  return `[Deterministic fallback] Low anomaly score (${score}/100). Continue monitoring. Unable to run full workflow without LLM API key.`;
}
