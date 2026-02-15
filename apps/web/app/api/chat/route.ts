import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getOrCreateConversation,
  getHistory,
  formatHistoryForLLM,
  addMessage,
} from "@/lib/memory";
import { observeHealthMentions } from "@/lib/health-observer";

const SYSTEM_PROMPT = `You are a compassionate health assistant for CareSync, a care coordination platform for elderly patients and their caregivers.

Your role:
- Help elderly patients understand their health information in clear, simple language
- Answer questions about appointments, medications, and care plans
- Provide reassurance and encouragement
- Escalate urgent health concerns appropriately
- Be patient, warm, and supportive

Guidelines:
- Use clear, simple language - avoid medical jargon when possible
- If you must use medical terms, explain them simply
- Be encouraging and positive about health management
- For urgent symptoms, always recommend contacting their healthcare provider
- Remember you're a helpful assistant, not a replacement for medical advice
- Keep responses concise but complete - elderly users may find long text overwhelming

Communication style:
- Warm and friendly, like a caring family member
- Patient and willing to repeat or clarify
- Use shorter paragraphs for easier reading
- Provide clear action steps when relevant`;

export async function POST(req: NextRequest) {
  try {
    // First check Clerk session — this covers signed-in users who may not
    // have a Human agent yet (getCurrentUser requires a linked Human row).
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

    // Use the agent handle if available, otherwise fall back to Clerk user ID
    const user = await getCurrentUser();
    if (!user) {
      console.warn("[POST /api/chat] No Human row for Clerk user", userId, "— health extraction will be skipped");
    }
    const handle = user?.handle ?? userId;
    const convoId = await getOrCreateConversation("chat", handle);

    // Persist user message
    await addMessage(convoId, {
      role: "user",
      content: message,
      metadata: { timestamp: new Date().toISOString() },
    });

    // Build messages array for Anthropic
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

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 2048,
        stream: true,
        system: SYSTEM_PROMPT,
        messages,
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error("[POST /api/chat] Anthropic error:", errText);
      return NextResponse.json(
        { error: "Anthropic API error", detail: errText },
        { status: anthropicRes.status },
      );
    }

    // Stream Anthropic SSE through to the client
    let fullText = "";
    const reader = anthropicRes.body!.getReader();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          let buffer = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            // Keep the last potentially incomplete line in the buffer
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const data = line.slice(6);
                if (data === "[DONE]") continue;
                try {
                  const parsed = JSON.parse(data);
                  if (
                    parsed.type === "content_block_delta" &&
                    parsed.delta?.type === "text_delta"
                  ) {
                    fullText += parsed.delta.text;
                  }
                } catch {
                  // skip non-JSON lines
                }
              }
              // Forward the raw line to the client
              controller.enqueue(
                new TextEncoder().encode(line + "\n"),
              );
            }
          }
          // Flush remaining buffer
          if (buffer.trim()) {
            controller.enqueue(
              new TextEncoder().encode(buffer + "\n"),
            );
          }
          controller.close();
        } catch (err) {
          console.error("[POST /api/chat] stream error:", err);
          controller.error(err);
        } finally {
          // Persist assistant response
          if (fullText) {
            await addMessage(convoId, {
              role: "assistant",
              content: fullText,
              metadata: { timestamp: new Date().toISOString() },
            });
          }
          // Fire-and-forget health extraction
          if (user?.id) {
            observeHealthMentions({
              userMessage: message,
              assistantResponse: fullText,
              humanId: user.id,
              conversationId: convoId,
              currentDate: new Date().toISOString().split("T")[0],
            }).catch((err) =>
              console.warn("[chat] health observer error (swallowed):", err)
            );
          }
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
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
