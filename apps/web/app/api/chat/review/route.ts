import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getOrCreateConversation,
  getHistory,
  formatHistoryForLLM,
  addMessage,
} from "@/lib/memory";
import { prisma } from "@/lib/store";

function buildSystemPrompt(
  extractions: Array<{
    category: string;
    summary: string;
    structuredData: string;
    mentionedDate: string | null;
    extractedAt: Date;
    confidence: number;
  }>,
): string {
  if (extractions.length === 0) {
    return `You are a health review assistant. You have access to the user's health data extracted from previous conversations, but no health information has been recorded yet. Let the user know that once they discuss health topics in the Chat tab, you'll be able to summarize and answer questions about their health history.`;
  }

  // Group by category
  const grouped: Record<string, typeof extractions> = {};
  for (const e of extractions) {
    if (!grouped[e.category]) grouped[e.category] = [];
    grouped[e.category].push(e);
  }

  let context = "";
  for (const [category, items] of Object.entries(grouped)) {
    context += `\n### ${category.toUpperCase()}\n`;
    for (const item of items) {
      const date = item.mentionedDate || item.extractedAt.toISOString().split("T")[0];
      context += `- [${date}] ${item.summary}`;
      const data = JSON.parse(item.structuredData);
      if (Object.keys(data).length > 0) {
        context += ` (${JSON.stringify(data)})`;
      }
      context += "\n";
    }
  }

  return `You are a health review assistant. You have access to the user's health data extracted from previous conversations. Help them understand trends, answer questions about their health history, and provide summaries.

Below is the health information recorded so far:
${context}
Use this data to answer the user's questions. If they ask about something not covered by the data, let them know. Be concise and helpful.`;
}

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
    const convoId = await getOrCreateConversation("health_review", handle);

    // Persist user message
    await addMessage(convoId, {
      role: "user",
      content: message,
      metadata: { timestamp: new Date().toISOString() },
    });

    // Fetch health extractions for system prompt context
    const extractions = user?.id
      ? await prisma.healthExtraction.findMany({
          where: { humanId: user.id },
          orderBy: { extractedAt: "desc" },
          take: 50,
          select: {
            category: true,
            summary: true,
            structuredData: true,
            mentionedDate: true,
            extractedAt: true,
            confidence: true,
          },
        })
      : [];

    const systemPrompt = buildSystemPrompt(extractions);

    // Build messages array for Anthropic
    const history = await getHistory("health_review", handle);
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
        system: systemPrompt,
        messages,
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error("[POST /api/chat/review] Anthropic error:", errText);
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
              controller.enqueue(
                new TextEncoder().encode(line + "\n"),
              );
            }
          }
          if (buffer.trim()) {
            controller.enqueue(
              new TextEncoder().encode(buffer + "\n"),
            );
          }
          controller.close();
        } catch (err) {
          console.error("[POST /api/chat/review] stream error:", err);
          controller.error(err);
        } finally {
          // Persist assistant response (no health observer for review agent)
          if (fullText) {
            await addMessage(convoId, {
              role: "assistant",
              content: fullText,
              metadata: { timestamp: new Date().toISOString() },
            });
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
    console.error("[POST /api/chat/review]", err);
    return NextResponse.json(
      {
        error: "server_error",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
