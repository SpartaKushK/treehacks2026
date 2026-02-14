import { NextRequest, NextResponse } from "next/server";
import { ensureSeed } from "@/lib/ensureSeed";
import { runSecretary } from "@/lib/secretary/agent";

/**
 * POST /api/trigger
 *
 * Open endpoint that accepts health trigger data and routes it through
 * the Secretary Agent. The secretary uses LLM function-calling to decide
 * which sub-tools to invoke (anomaly analysis, triage, scheduling, etc.)
 * and returns a final decision.
 *
 * Body:
 * {
 *   "trigger_type": "health_anomaly" | "health_summary" | "schedule" | "custom",
 *   "provider": "openai" | "claude",        // optional, defaults to "openai"
 *   "data": { ... trigger-specific payload },
 *   "description": "optional description"
 * }
 *
 * Response:
 * {
 *   "traceId": "uuid",
 *   "finalDecision": "Secretary's summary ...",
 *   "toolCallLog": [ { tool, args, result }, ... ],
 *   "provider": "openai" | "claude",
 *   "turns": 3
 * }
 */
export async function POST(req: NextRequest) {
  try {
    await ensureSeed();

    const body = await req.json();

    // Validate required field
    if (!body.data || typeof body.data !== "object") {
      return NextResponse.json(
        { error: "Missing or invalid 'data' field. Must be a JSON object." },
        { status: 400 },
      );
    }

    const provider: "openai" | "claude" =
      body.provider === "claude" ? "claude" : "openai";

    const triggerType = body.trigger_type || "custom";
    const description =
      body.description ||
      `Incoming ${triggerType} trigger`;

    const result = await runSecretary({
      triggerData: body.data,
      provider,
      triggerDescription: description,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("[/api/trigger] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
