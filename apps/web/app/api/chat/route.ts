import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getOrCreateConversation,
  getHistory,
  formatHistoryForLLM,
  addMessage,
} from "@/lib/memory";
import {
  toAnthropicTools,
  executeTool,
  type ToolContext,
} from "@/lib/secretary/tools";
import { startTrace, addStep } from "@/lib/trace";

/* ------------------------------------------------------------------ */
/*  System prompt — now healthcare-aware with tool access               */
/* ------------------------------------------------------------------ */

function buildSystemPrompt(userHandle: string): string {
  return `You are a personal health management AI assistant. You are friendly, concise, and helpful.

## Current User
The current user's handle is "${userHandle}". ALWAYS use this handle when calling any tool — never ask the user for their handle.

## Your Capabilities
You have access to specialized tools and sub-agents:

### Health Agent (analyze_anomaly, get_health_summary, triage_patient, lookup_clinical_evidence)
These tools delegate to a Health Analysis Agent that has its own reasoning loop and access to:
- Anomaly analysis — evaluate wearable data for concerning patterns
- 30-day health summaries — sleep, activity, medication, symptom trends
- Raw health metrics and past anomaly alert history
- Triage intake and urgency scoring
- PubMed literature and clinical guideline searches

### Scheduler Agent (schedule_appointment)
This tool delegates to a Scheduling Agent that manages Google Calendar operations:
- Check availability and find free time slots
- Book appointments on the user's calendar

### Doctor Agent tools
- notify_doctor_agent: forward a HealthAlert payload to the external Doctor Agent service via /api/doctor/alert proxy to run its own triage/scheduling pipeline.
- check_doctor_availability: calls the Doctor Agent to get REAL free slots on the doctor's calendar (no booking). Use when the user asks about the doctor's availability or open times. All times are in Pacific (PST/PDT); report them to the user as such.

## How to Use Tools
- When the user asks to schedule something on THEIR calendar → use **schedule_appointment** with user_handle="${userHandle}"
- When the user asks to schedule WITH THE DOCTOR or with Dr. Smith → use **schedule_appointment** with user_handle="${userHandle}" AND doctor_handle="dr_smith". If they specify a date (e.g. "Feb 20"), pass **preferred_date** in YYYY-MM-DD (e.g. 2026-02-20). If they specify a time (e.g. "9am", "at 9"), pass **preferred_time** (e.g. "9am") so that time is booked when available.
- When the user shares health data or asks about an anomaly → use **analyze_anomaly** with user_handle="${userHandle}"
- When the user asks about their health trends → use **get_health_summary** with patient_handle="${userHandle}"
- When the user asks about clinical evidence or medical studies → use **lookup_clinical_evidence**
- When the user asks about triage or urgency of symptoms → use **triage_patient** with patient_handle="${userHandle}"
- When the user asks for the DOCTOR's availability or a specific day (e.g. "Feb 20", "February 20th") → call **check_doctor_availability** with doctor_handle="dr_smith", and if they asked for a specific day pass **date** in YYYY-MM-DD (e.g. 2026-02-20). Use window_hours 240 for a 10-day window when no date given. Report the slots returned; do not offer alternative options like "search further" or "book earlier" unless the user explicitly asks. Never state that the doctor has no slots (or has slots) without calling this tool first — you have no way to know otherwise.
- Only when explicitly asked to involve/escalate to the doctor agent pipeline, use **notify_doctor_agent** with the appropriate alert payload.

## Important Rules
- Always use your tools when the user asks for something you can do with them. NEVER say you don't have access to calendars or health tools.
- For doctor availability: call check_doctor_availability (pass **date** in YYYY-MM-DD when they ask for a specific day). Report the returned slots; do not offer "would you like me to search further or book earlier?" — just answer with the slots or say none on that day.
- When the user gives a specific date or time (e.g. "Feb 20", "9am"), pass it through (preferred_date, preferred_time, or date for availability) and do that; do not suggest booking a different time instead.
- If the user asks for availability only, DO NOT book; return slots using check_doctor_availability.
- NEVER ask for the user's handle — you already know it is "${userHandle}".
- Keep your responses clear and well-structured.
- You are NOT a doctor — tools provide analysis, not diagnoses.`;
}

/* ------------------------------------------------------------------ */
/*  POST /api/chat — tool-calling chat with SSE streaming               */
/* ------------------------------------------------------------------ */

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY is not configured" },
        { status: 500 },
      );
    }

    const { message } = await req.json();
    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "message is required" },
        { status: 400 },
      );
    }

    const user = await getCurrentUser();
    const handle = user?.handle ?? userId;
    const convoId = await getOrCreateConversation("chat", handle);

    // Persist user message
    await addMessage(convoId, {
      role: "user",
      content: message,
      metadata: { timestamp: new Date().toISOString() },
    });

    // Build messages array
    const history = await getHistory("chat", handle);
    const formatted = formatHistoryForLLM(history);

    // Merge consecutive same-role messages to avoid Anthropic 400 errors
    const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
    for (const msg of formatted) {
      const last = messages[messages.length - 1];
      if (last && last.role === msg.role) {
        last.content += "\n\n" + msg.content;
      } else {
        messages.push({ ...msg });
      }
    }

    // Ensure conversation starts with a user message
    if (messages.length > 0 && messages[0].role === "assistant") {
      messages.shift();
    }

    // Tool context for executing tools
    const traceId = startTrace({ provider: "claude", title: `Chat: ${handle}` });
    const toolCtx: ToolContext = {
      traceId,
      provider: "claude",
      triggerData: { user_handle: handle },
    };

    // Get tools in Anthropic format
    const tools = toAnthropicTools();

    // Run the tool-calling loop (non-streaming) then stream the final response
    // We need to handle tool calls first, then stream the final text
    const loopMessages: Array<Record<string, unknown>> = [
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const MAX_TOOL_TURNS = 6;
    let toolCallsMade = false;

    for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
      // Non-streaming call to check for tool use
      const checkRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 2048,
          system: buildSystemPrompt(handle),
          messages: loopMessages,
          tools,
        }),
      });

      if (!checkRes.ok) {
        const errText = await checkRes.text();
        console.error("[POST /api/chat] Anthropic error:", errText);
        return NextResponse.json(
          { error: "Anthropic API error", detail: errText },
          { status: checkRes.status },
        );
      }

      const data = await checkRes.json();
      const content = data.content as Array<Record<string, unknown>>;

      if (!content || content.length === 0) {
        break;
      }

      // Check if there are tool_use blocks
      const toolUseBlocks = content.filter(
        (b) => b.type === "tool_use",
      );

      if (toolUseBlocks.length === 0) {
        // No tool calls — extract text and stream it to client
        const textParts = content
          .filter((b) => b.type === "text")
          .map((b) => b.text as string);
        const finalText = textParts.join("\n");

        // Persist assistant response
        if (finalText) {
          await addMessage(convoId, {
            role: "assistant",
            content: finalText,
            metadata: { timestamp: new Date().toISOString(), toolCallsMade },
          });
        }

        // Return as SSE stream for frontend compatibility
        return createTextSSEResponse(finalText);
      }

      // There are tool calls — execute them
      toolCallsMade = true;

      // Add the assistant's response (with tool_use blocks) to messages
      loopMessages.push({ role: "assistant", content });

      // Execute each tool and build tool results
      const toolResults: Array<Record<string, unknown>> = [];

      for (const toolUse of toolUseBlocks) {
        const toolName = toolUse.name as string;
        const toolInput = toolUse.input as Record<string, unknown>;
        const toolId = toolUse.id as string;

        addStep(traceId, {
          actor: "chat",
          event: "TOOL_CALL",
          ok: true,
          data: { tool: toolName, args: toolInput },
        });

        console.log(`[Chat] Calling tool: ${toolName}`, JSON.stringify(toolInput).slice(0, 200));

        const result = await executeTool(toolName, toolInput, toolCtx);

        addStep(traceId, {
          actor: toolName,
          event: "TOOL_RESULT",
          ok: !result.error,
          data: result,
        });

        console.log(`[Chat] Tool result: ${toolName}`, JSON.stringify(result).slice(0, 200));

        toolResults.push({
          type: "tool_result",
          tool_use_id: toolId,
          content: JSON.stringify(result),
        });
      }

      // Add tool results and continue the loop
      loopMessages.push({ role: "user", content: toolResults });
    }

    // If we exhausted tool turns, make one final call without tools to get a text summary
    const finalRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 2048,
        system: buildSystemPrompt(handle),
        messages: loopMessages,
      }),
    });

    if (!finalRes.ok) {
      const errText = await finalRes.text();
      console.error("[POST /api/chat] Anthropic final error:", errText);
      return NextResponse.json(
        { error: "Anthropic API error", detail: errText },
        { status: finalRes.status },
      );
    }

    const finalData = await finalRes.json();
    const finalContent = finalData.content as Array<Record<string, unknown>>;
    const finalText = (finalContent || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text as string)
      .join("\n");

    // Persist
    if (finalText) {
      await addMessage(convoId, {
        role: "assistant",
        content: finalText,
        metadata: { timestamp: new Date().toISOString(), toolCallsMade },
      });
    }

    return createTextSSEResponse(finalText || "I completed the task but couldn't generate a summary.");
  } catch (err) {
    console.error("[POST /api/chat]", err);
    return NextResponse.json(
      {
        error: "server_error",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Helper: wrap a final text string as an SSE stream for the frontend */
/* ------------------------------------------------------------------ */

function createTextSSEResponse(text: string): Response {
  const encoder = new TextEncoder();

  // Simulate the Anthropic SSE format that the frontend expects
  const events = [
    `event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: "msg_chat", type: "message", role: "assistant", content: [] } })}\n\n`,
    `event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })}\n\n`,
  ];

  // Send text in chunks for a streaming feel
  const CHUNK_SIZE = 20;
  for (let i = 0; i < text.length; i += CHUNK_SIZE) {
    const chunk = text.slice(i, i + CHUNK_SIZE);
    events.push(
      `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: chunk } })}\n\n`,
    );
  }

  events.push(
    `event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`,
    `event: message_delta\ndata: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: "end_turn" } })}\n\n`,
    `event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`,
  );

  const body = events.join("");

  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(body));
        controller.close();
      },
    }),
    {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    },
  );
}
