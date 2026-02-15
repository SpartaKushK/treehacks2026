/**
 * Scheduler Agent — Sub-agent with composable Google Calendar tools
 *
 * The Secretary delegates scheduling requests here. The SchedulerAgent
 * runs its own LLM tool-calling loop with three composable tools that
 * each wrap a function from google-calendar.ts:
 *
 *   1. read_calendar   → getBusySlots (Google + local events)
 *   2. check_availability → findAvailableSlots
 *   3. book_appointment   → bookCalendarEvent (Google + local)
 *
 * Supports both Anthropic (Claude) and OpenAI (GPT-4o-mini) backends.
 */

import {
  getBusySlots,
  findAvailableSlots,
  bookCalendarEvent,
} from "../google-calendar";
import { prisma } from "../store";
import { addStep } from "../trace";
import {
  saveInteraction,
  saveToolInteraction,
} from "../memory";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface SchedulerInput {
  user_handle: string;
  title: string;
  urgency: "routine" | "soon" | "urgent";
  duration_mins?: number;
  method?: "in_person" | "telehealth";
  description?: string;
}

export interface SchedulerResult {
  error: boolean;
  finalDecision: string;
  toolCallLog: ToolCallLogEntry[];
  turns: number;
}

interface ToolCallLogEntry {
  tool: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
}

interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

interface SchedulerContext {
  traceId: string;
  provider: "openai" | "claude";
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const MAX_TURNS = 8;

const SCHEDULER_SYSTEM_PROMPT = `You are a Scheduler Agent that manages calendar operations and appointment booking.

You have three tools:
1. **read_calendar** — View existing events on a user's calendar for a date range
2. **check_availability** — Find free time slots during business hours (9am-6pm, weekdays)
3. **book_appointment** — Book an event on the user's Google Calendar and local store

## Workflow
When asked to schedule an appointment:
1. Use check_availability to find free slots based on urgency level
2. Pick the best slot (earliest for urgent, most convenient for routine)
3. Use book_appointment to create the event
4. Report the outcome clearly with the booked date/time

## Urgency Guidelines
- **urgent**: Search starting today. Book the first available slot.
- **soon**: Search starting 1 day out. Prefer morning slots.
- **routine**: Search starting 3 days out.

## Rules
- Always use the tools — never fabricate calendar data.
- If no slots found, try expanding the search window by a few days.
- Confirm the booking details in your final response.
- Business hours only: 9am-6pm, Monday-Friday.`;

/* ------------------------------------------------------------------ */
/*  Tool definitions (composable, each wraps one google-calendar fn)   */
/* ------------------------------------------------------------------ */

function buildTools(humanId: string): ToolDef[] {
  return [
    {
      name: "read_calendar",
      description:
        "Read events from the user's calendar (Google Calendar + local) " +
        "for a given date range. Returns a list of events with start, end, and title.",
      parameters: {
        type: "object",
        properties: {
          time_min: {
            type: "string",
            description: "ISO datetime — start of range to read",
          },
          time_max: {
            type: "string",
            description: "ISO datetime — end of range to read",
          },
        },
        required: ["time_min", "time_max"],
      },
      async execute(args) {
        try {
          const events = await getBusySlots(
            humanId,
            args.time_min as string,
            args.time_max as string,
          );
          return {
            error: false,
            events,
            count: events.length,
            message: `Found ${events.length} events between ${args.time_min} and ${args.time_max}.`,
          };
        } catch (e) {
          console.error("[SchedulerAgent] read_calendar error:", e);
          return {
            error: true,
            message: `Failed to read calendar: ${e instanceof Error ? e.message : String(e)}`,
          };
        }
      },
    },
    {
      name: "check_availability",
      description:
        "Find available time slots in the user's calendar. " +
        "Returns free slots of the requested duration during business hours (9am-6pm weekdays).",
      parameters: {
        type: "object",
        properties: {
          window_start: {
            type: "string",
            description: "ISO datetime — start of search window",
          },
          window_end: {
            type: "string",
            description: "ISO datetime — end of search window",
          },
          duration_mins: {
            type: "number",
            description: "Appointment duration in minutes (default 30)",
          },
          max_slots: {
            type: "number",
            description: "Maximum number of slots to return (default 5)",
          },
        },
        required: ["window_start", "window_end"],
      },
      async execute(args) {
        try {
          const slots = await findAvailableSlots(
            humanId,
            args.window_start as string,
            args.window_end as string,
            (args.duration_mins as number) || 30,
            (args.max_slots as number) || 5,
          );
          return {
            error: false,
            available_slots: slots,
            count: slots.length,
            message:
              slots.length > 0
                ? `Found ${slots.length} available slots.`
                : "No available slots found in the given window.",
          };
        } catch (e) {
          console.error("[SchedulerAgent] check_availability error:", e);
          return {
            error: true,
            message: `Failed to check availability: ${e instanceof Error ? e.message : String(e)}`,
          };
        }
      },
    },
    {
      name: "book_appointment",
      description:
        "Book an appointment on the user's calendar. Creates the event on " +
        "Google Calendar (if connected) and saves locally. Returns booking confirmation.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Appointment title" },
          start: {
            type: "string",
            description: "ISO datetime — start of appointment",
          },
          end: {
            type: "string",
            description: "ISO datetime — end of appointment",
          },
          description: {
            type: "string",
            description: "Optional description for the calendar event",
          },
        },
        required: ["title", "start", "end"],
      },
      async execute(args) {
        try {
          const result = await bookCalendarEvent(humanId, {
            summary: args.title as string,
            start: args.start as string,
            end: args.end as string,
            description: (args.description as string) || undefined,
          });
          return {
            error: false,
            scheduled: true,
            booking: {
              start: args.start,
              end: args.end,
              title: args.title,
            },
            localId: result.localId,
            googleEventId: result.googleEventId,
            google_calendar: result.googleEventId
              ? { synced: true, event_id: result.googleEventId }
              : { synced: false, reason: "Google Calendar not connected — saved locally" },
            message: `Booked: ${args.title} on ${new Date(args.start as string).toLocaleDateString()} at ${new Date(args.start as string).toLocaleTimeString()}.`,
          };
        } catch (e) {
          console.error("[SchedulerAgent] book_appointment error:", e);
          return {
            error: true,
            scheduled: false,
            message: `Failed to book appointment: ${e instanceof Error ? e.message : String(e)}`,
          };
        }
      },
    },
  ];
}

/* ------------------------------------------------------------------ */
/*  Main entry point                                                   */
/* ------------------------------------------------------------------ */

/**
 * Run the Scheduler Agent. Resolves the user, builds calendar tools
 * scoped to that user, then runs an LLM tool-calling loop.
 */
export async function runSchedulerAgent(
  input: SchedulerInput,
  ctx: SchedulerContext,
): Promise<SchedulerResult> {
  const {
    user_handle: handle,
    title,
    urgency,
    duration_mins: durationMins = 30,
    method,
    description,
  } = input;

  // 1. Resolve user
  let human: { id: string } | null = null;
  try {
    human = await prisma.human.findUnique({
      where: { handle },
      select: { id: true },
    });
  } catch (e) {
    console.error("[SchedulerAgent] DB error resolving user:", e);
    return {
      error: true,
      finalDecision: `Database error resolving user '${handle}': ${e instanceof Error ? e.message : String(e)}`,
      toolCallLog: [],
      turns: 0,
    };
  }

  if (!human) {
    return {
      error: true,
      finalDecision: `User '${handle}' not found.`,
      toolCallLog: [],
      turns: 0,
    };
  }

  addStep(ctx.traceId, {
    actor: "scheduler_agent",
    event: "SCHEDULER_START",
    ok: true,
    data: { handle, urgency, durationMins, title },
  });

  // 2. Build tools scoped to this user's humanId
  const tools = buildTools(human.id);

  // 3. Build the scheduling prompt for the LLM
  const dayGuidance =
    urgency === "urgent"
      ? "TODAY or the next available slot"
      : urgency === "soon"
        ? "within the next 1-2 days"
        : "within the next 3-7 days";

  const effectiveMethod =
    method || (urgency === "urgent" ? "in_person" : "telehealth");

  const now = new Date();
  const dayOffset = urgency === "urgent" ? 0 : urgency === "soon" ? 1 : 3;
  const windowStart = new Date(now);
  windowStart.setDate(windowStart.getDate() + dayOffset);
  const windowEnd = new Date(now);
  windowEnd.setDate(windowEnd.getDate() + dayOffset + 7);

  const userMessage = `Schedule an appointment for user "${handle}":
- Title: ${title}
- Urgency: ${urgency} (target: ${dayGuidance})
- Duration: ${durationMins} minutes
- Method: ${effectiveMethod}
${description ? `- Description: ${description}` : ""}

Suggested search window: ${windowStart.toISOString()} to ${windowEnd.toISOString()}

Steps:
1. Use check_availability to find free ${durationMins}-minute slots in the window
2. If slots found, book_appointment with the best one
3. If no slots, expand the window and try again
4. Report the final outcome`;

  // 4. Run the agentic loop
  const toolCallLog: ToolCallLogEntry[] = [];

  const provider = ctx.provider;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  let result: { finalDecision: string; turns: number };

  try {
    if (provider === "claude" && anthropicKey) {
      result = await runAnthropicLoop(userMessage, tools, toolCallLog, ctx);
    } else if (openaiKey) {
      result = await runOpenAILoop(userMessage, tools, toolCallLog, ctx);
    } else if (anthropicKey) {
      result = await runAnthropicLoop(userMessage, tools, toolCallLog, ctx);
    } else {
      // No API key — deterministic fallback
      result = await runDeterministicFallback(human.id, input, toolCallLog, ctx);
    }
  } catch (e) {
    console.error("[SchedulerAgent] LLM loop error:", e);
    // If we got some tool results before the crash, summarize them
    result = {
      finalDecision:
        toolCallLog.length > 0
          ? buildFallbackSummary(toolCallLog)
          : `Scheduler error: ${e instanceof Error ? e.message : String(e)}`,
      turns: 0,
    };
  }

  // 5. Save to scheduler memory
  try {
    await saveInteraction(
      "scheduler",
      handle,
      userMessage,
      result.finalDecision,
      {
        provider: ctx.provider,
        traceId: ctx.traceId,
        turns: result.turns,
        toolCallsCount: toolCallLog.length,
      },
    );
    for (const tc of toolCallLog) {
      await saveToolInteraction("scheduler", handle, tc.tool, tc.args, tc.result);
    }
  } catch (e) {
    console.warn("[SchedulerAgent] Failed to save memory:", e);
  }

  addStep(ctx.traceId, {
    actor: "scheduler_agent",
    event: "SCHEDULER_COMPLETE",
    ok: !result.finalDecision.startsWith("Scheduler error"),
    data: {
      finalDecision: result.finalDecision.slice(0, 300),
      turns: result.turns,
      toolCalls: toolCallLog.length,
    },
  });

  return {
    error: false,
    finalDecision: result.finalDecision,
    toolCallLog,
    turns: result.turns,
  };
}

/* ------------------------------------------------------------------ */
/*  Anthropic (Claude) tool-calling loop                               */
/* ------------------------------------------------------------------ */

async function runAnthropicLoop(
  userMessage: string,
  tools: ToolDef[],
  toolCallLog: ToolCallLogEntry[],
  ctx: SchedulerContext,
): Promise<{ finalDecision: string; turns: number }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { finalDecision: "Anthropic API key not configured.", turns: 0 };
  }

  const messages: Array<Record<string, unknown>> = [
    { role: "user", content: userMessage },
  ];

  const anthropicTools = tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    let data: Record<string, unknown>;

    try {
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
          system: SCHEDULER_SYSTEM_PROMPT,
          messages,
          tools: anthropicTools,
        }),
      });

      data = await res.json();
    } catch (e) {
      console.error("[SchedulerAgent] Anthropic fetch error on turn", turn, e);
      return {
        finalDecision:
          toolCallLog.length > 0
            ? buildFallbackSummary(toolCallLog)
            : `Scheduler network error: ${e instanceof Error ? e.message : String(e)}`,
        turns: turn + 1,
      };
    }

    if (data.error || data.type === "error") {
      const errMsg =
        (data.error as Record<string, unknown>)?.message ||
        JSON.stringify(data);
      console.error("[SchedulerAgent] Anthropic API error:", errMsg);
      return {
        finalDecision:
          toolCallLog.length > 0
            ? buildFallbackSummary(toolCallLog)
            : `Scheduler LLM error: ${errMsg}`,
        turns: turn + 1,
      };
    }

    const content = data.content as Array<Record<string, unknown>> | undefined;
    if (!content || content.length === 0) {
      return {
        finalDecision:
          toolCallLog.length > 0
            ? buildFallbackSummary(toolCallLog)
            : "Scheduler error: no response from LLM.",
        turns: turn + 1,
      };
    }

    // Parse response blocks
    const textBlocks: string[] = [];
    const toolUseBlocks: Array<{
      id: string;
      name: string;
      input: Record<string, unknown>;
    }> = [];

    for (const block of content) {
      if (block.type === "text") textBlocks.push(block.text as string);
      else if (block.type === "tool_use") {
        toolUseBlocks.push({
          id: block.id as string,
          name: block.name as string,
          input: block.input as Record<string, unknown>,
        });
      }
    }

    if (toolUseBlocks.length > 0) {
      // Append assistant message (with tool_use blocks) and tool results
      messages.push({ role: "assistant", content });

      const toolResults: Array<Record<string, unknown>> = [];

      for (const toolUse of toolUseBlocks) {
        addStep(ctx.traceId, {
          actor: "scheduler_agent",
          event: "TOOL_CALL",
          ok: true,
          data: { tool: toolUse.name, args: toolUse.input },
        });

        const tool = tools.find((t) => t.name === toolUse.name);
        // Tool execute() already has its own try/catch
        const result = tool
          ? await tool.execute(toolUse.input)
          : { error: true, message: `Unknown tool: ${toolUse.name}` };

        addStep(ctx.traceId, {
          actor: toolUse.name,
          event: "TOOL_RESULT",
          ok: !result.error,
          data: result,
        });

        toolCallLog.push({
          tool: toolUse.name,
          args: toolUse.input,
          result,
        });

        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: JSON.stringify(result),
        });
      }

      messages.push({ role: "user", content: toolResults });
      continue;
    }

    // No tool calls — LLM is done
    return {
      finalDecision: textBlocks.join("\n") || "Scheduling complete.",
      turns: turn + 1,
    };
  }

  return {
    finalDecision:
      toolCallLog.length > 0
        ? buildFallbackSummary(toolCallLog)
        : "Scheduler reached max turns.",
    turns: MAX_TURNS,
  };
}

/* ------------------------------------------------------------------ */
/*  OpenAI tool-calling loop                                           */
/* ------------------------------------------------------------------ */

async function runOpenAILoop(
  userMessage: string,
  tools: ToolDef[],
  toolCallLog: ToolCallLogEntry[],
  ctx: SchedulerContext,
): Promise<{ finalDecision: string; turns: number }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { finalDecision: "OpenAI API key not configured.", turns: 0 };
  }

  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: SCHEDULER_SYSTEM_PROMPT },
    { role: "user", content: userMessage },
  ];

  const openaiTools = tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    let data: Record<string, unknown>;

    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages,
          tools: openaiTools,
          tool_choice: "auto",
          max_tokens: 1024,
        }),
      });

      data = await res.json();
    } catch (e) {
      console.error("[SchedulerAgent] OpenAI fetch error on turn", turn, e);
      return {
        finalDecision:
          toolCallLog.length > 0
            ? buildFallbackSummary(toolCallLog)
            : `Scheduler network error: ${e instanceof Error ? e.message : String(e)}`,
        turns: turn + 1,
      };
    }

    const choices = data.choices as Array<Record<string, unknown>> | undefined;
    const msg = choices?.[0]?.message as Record<string, unknown> | undefined;

    if (!msg) {
      const err =
        (data.error as Record<string, unknown>)?.message ||
        JSON.stringify(data);
      console.error("[SchedulerAgent] OpenAI no message:", err);
      return {
        finalDecision:
          toolCallLog.length > 0
            ? buildFallbackSummary(toolCallLog)
            : `OpenAI error: ${err}`,
        turns: turn + 1,
      };
    }

    const msgContent = msg.content;
    const textContent =
      typeof msgContent === "string"
        ? msgContent
        : (msgContent as Array<Record<string, unknown>>)?.[0]?.text ?? "";
    const toolCalls = (msg.tool_calls || []) as Array<Record<string, unknown>>;

    if (toolCalls.length === 0) {
      return {
        finalDecision: (textContent as string) || "Scheduling complete.",
        turns: turn + 1,
      };
    }

    // Append assistant message with tool calls
    messages.push({
      role: "assistant",
      content: textContent || null,
      tool_calls: toolCalls.map((tc) => {
        const fn = tc.function as Record<string, string>;
        return {
          id: tc.id,
          type: "function",
          function: {
            name: fn?.name || "",
            arguments: fn?.arguments || "{}",
          },
        };
      }),
    });

    // Execute each tool call
    for (const tc of toolCalls) {
      const fn = tc.function as Record<string, string>;
      const name = fn?.name || "";
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(fn?.arguments || "{}");
      } catch {
        args = {};
      }

      addStep(ctx.traceId, {
        actor: "scheduler_agent",
        event: "TOOL_CALL",
        ok: true,
        data: { tool: name, args },
      });

      const tool = tools.find((t) => t.name === name);
      // Tool execute() already has its own try/catch
      const result = tool
        ? await tool.execute(args)
        : { error: true, message: `Unknown tool: ${name}` };

      addStep(ctx.traceId, {
        actor: name,
        event: "TOOL_RESULT",
        ok: !result.error,
        data: result,
      });

      toolCallLog.push({ tool: name, args, result });

      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify(result),
      });
    }
  }

  return {
    finalDecision:
      toolCallLog.length > 0
        ? buildFallbackSummary(toolCallLog)
        : "Scheduler reached max turns.",
    turns: MAX_TURNS,
  };
}

/* ------------------------------------------------------------------ */
/*  Deterministic fallback (no API key available)                      */
/* ------------------------------------------------------------------ */

async function runDeterministicFallback(
  humanId: string,
  input: SchedulerInput,
  toolCallLog: ToolCallLogEntry[],
  ctx: SchedulerContext,
): Promise<{ finalDecision: string; turns: number }> {
  const { urgency, duration_mins: durationMins = 30, title } = input;

  const now = new Date();
  const dayOffset = urgency === "urgent" ? 0 : urgency === "soon" ? 1 : 3;
  const windowStart = new Date(now);
  windowStart.setDate(windowStart.getDate() + dayOffset);
  const windowEnd = new Date(now);
  windowEnd.setDate(windowEnd.getDate() + dayOffset + 7);

  // Find available slots
  const slots = await findAvailableSlots(
    humanId,
    windowStart.toISOString(),
    windowEnd.toISOString(),
    durationMins,
    5,
  );

  toolCallLog.push({
    tool: "check_availability",
    args: {
      window_start: windowStart.toISOString(),
      window_end: windowEnd.toISOString(),
      duration_mins: durationMins,
    },
    result: { available_slots: slots, count: slots.length },
  });

  if (slots.length === 0) {
    return {
      finalDecision: `[Deterministic] No available ${durationMins}-minute slots found for '${input.user_handle}' in the next ${dayOffset + 7} days.`,
      turns: 1,
    };
  }

  // Book the first available slot
  const chosenSlot = slots[0];
  const booking = await bookCalendarEvent(humanId, {
    summary: title,
    start: chosenSlot.start,
    end: chosenSlot.end,
    description: input.description || `${title}. Urgency: ${urgency}.`,
  });

  toolCallLog.push({
    tool: "book_appointment",
    args: { title, start: chosenSlot.start, end: chosenSlot.end },
    result: {
      scheduled: true,
      localId: booking.localId,
      googleEventId: booking.googleEventId,
    },
  });

  addStep(ctx.traceId, {
    actor: "scheduler_agent",
    event: "APPOINTMENT_BOOKED",
    ok: true,
    data: {
      slot: chosenSlot,
      localId: booking.localId,
      googleEventId: booking.googleEventId,
    },
  });

  return {
    finalDecision: `[Deterministic] Appointment booked: ${title} on ${new Date(chosenSlot.start).toLocaleDateString()} at ${new Date(chosenSlot.start).toLocaleTimeString()}.${booking.googleEventId ? " Synced to Google Calendar." : " Saved locally."}`,
    turns: 1,
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function buildFallbackSummary(toolCallLog: ToolCallLogEntry[]): string {
  const parts: string[] = ["[Scheduler fallback summary]\n"];

  for (const tc of toolCallLog) {
    parts.push(`Tool: ${tc.tool}`);
    const r = tc.result;
    if (tc.tool === "book_appointment" && r.scheduled) {
      const booking = r.booking as Record<string, unknown> | undefined;
      parts.push(`  Booked: ${booking?.title || "appointment"}`);
      parts.push(`  Time: ${booking?.start || "unknown"}`);
      parts.push(
        `  Google: ${r.googleEventId ? "synced" : "local only"}`,
      );
    } else if (tc.tool === "check_availability") {
      parts.push(`  Found ${r.count || 0} available slots`);
    } else if (tc.tool === "read_calendar") {
      parts.push(`  Found ${r.count || 0} existing events`);
    } else if (r.error) {
      parts.push(`  Error: ${r.message || JSON.stringify(r)}`);
    } else {
      parts.push(`  Result: ${JSON.stringify(r).slice(0, 200)}`);
    }
    parts.push("");
  }

  return parts.join("\n");
}
