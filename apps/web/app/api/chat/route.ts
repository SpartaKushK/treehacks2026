import { NextRequest, NextResponse } from "next/server";
import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import {
  healthcareServer,
  setActiveContext,
} from "@/lib/secretary/healthcareMcpServer";
import { SECRETARY_SYSTEM_PROMPT } from "@/lib/secretary/prompts";
import { startTrace, addStep, finalizeTrace } from "@/lib/trace";
import { preToolUseHook, postToolUseHook } from "@/lib/secretary/traceHooks";

export const runtime = "nodejs";

/**
 * POST /api/chat
 *
 * Multi-turn patient conversation endpoint powered by the Claude Agent SDK.
 * Supports session resumption for continuous conversations.
 *
 * Body:
 * {
 *   "message": "string",             // Required: patient's message
 *   "sessionId": "string",           // Optional: resume previous session
 *   "patientHandle": "string"        // Optional: patient identifier
 * }
 *
 * Response:
 * {
 *   "response": "string",
 *   "sessionId": "string",
 *   "traceId": "string"
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, sessionId, patientHandle } = body;

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid 'message' field." },
        { status: 400 }
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY not configured." },
        { status: 503 }
      );
    }

    const traceId = startTrace({
      provider: "claude",
      title: `Chat: ${patientHandle || "patient"}`,
    });

    setActiveContext({ traceId, provider: "claude" });

    let response = "";
    let newSessionId = sessionId;

    try {
      const q = query({
        prompt: message,
        options: {
          systemPrompt: SECRETARY_SYSTEM_PROMPT,
          model: "claude-sonnet-4-5-20250929",
          maxTurns: 5,
          persistSession: true,
          ...(sessionId ? { resume: sessionId } : {}),
          mcpServers: { healthcare: healthcareServer },
          allowedTools: [
            "mcp__healthcare__analyze_anomaly",
            "mcp__healthcare__lookup_clinical_evidence",
            "mcp__healthcare__triage_patient",
            "mcp__healthcare__get_health_summary",
            "mcp__healthcare__schedule_appointment",
            "WebSearch",
          ],
          tools: [],
          permissionMode: "bypassPermissions",
          allowDangerouslySkipPermissions: true,
          hooks: {
            PreToolUse: [{ hooks: [preToolUseHook] }],
            PostToolUse: [{ hooks: [postToolUseHook] }],
          },
        },
      });

      for await (const msg of q) {
        if (
          msg.type === "system" &&
          "subtype" in msg &&
          msg.subtype === "init"
        ) {
          const initMsg = msg as SDKMessage & { session_id: string };
          newSessionId = initMsg.session_id;
        }
        if (msg.type === "result") {
          const resultMsg = msg as SDKMessage & {
            subtype: string;
            result?: string;
          };
          if (resultMsg.subtype === "success" && resultMsg.result) {
            response = resultMsg.result;
          }
        }
      }

      await finalizeTrace(traceId);

      return NextResponse.json({
        response: response || "I couldn't generate a response. Please try again.",
        sessionId: newSessionId,
        traceId,
      });
    } catch (err) {
      console.error("[/api/chat] Agent SDK error:", err);
      await finalizeTrace(traceId);
      return NextResponse.json(
        {
          error:
            err instanceof Error ? err.message : "Internal server error",
        },
        { status: 500 }
      );
    } finally {
      setActiveContext(null);
    }
  } catch (err) {
    console.error("[/api/chat] Parse error:", err);
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
}
