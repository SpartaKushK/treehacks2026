import { NextRequest, NextResponse } from "next/server";
import { ensureSeed } from "@/lib/ensureSeed";
import { runSecretary } from "@/lib/secretary/agent";
import { prisma } from "@/lib/store";

export const runtime = "nodejs";

/**
 * POST /api/trigger
 *
 * Open endpoint that accepts health trigger data and routes it through
 * the Secretary Agent powered by the Claude Agent SDK. The agent
 * autonomously decides which tools to invoke (anomaly analysis, clinical
 * evidence lookup, triage, scheduling, web search, etc.) and returns a
 * final decision.
 *
 * Body:
 * {
 *   "trigger_type": "health_anomaly" | "health_summary" | "schedule" | "custom",
 *   "data": { ... trigger-specific payload },
 *   "description": "optional description"
 * }
 *
 * Response:
 * {
 *   "traceId": "uuid",
 *   "finalDecision": "Secretary's summary ...",
 *   "toolCallLog": [ { tool, args, result }, ... ],
 *   "provider": "claude",
 *   "turns": 3,
 *   "sessionId": "uuid",
 *   "costUsd": 0.01
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

    // Always use Claude via the Agent SDK
    const provider: "openai" | "claude" = "claude";

    const triggerType = body.trigger_type || "custom";
    const description =
      body.description ||
      `Incoming ${triggerType} trigger`;

    const result = await runSecretary({
      triggerData: body.data,
      provider,
      triggerDescription: description,
    });

    // Extract clinical evidence from tool call log (if the secretary called it)
    const evidenceCall = result.toolCallLog.find(
      (tc) => tc.tool === "lookup_clinical_evidence"
    );
    const evidenceJson = evidenceCall ? JSON.stringify(evidenceCall.result) : null;

    // Persist anomaly alert with evidence if this was a health anomaly trigger
    if (triggerType === "health_anomaly" && body.data.user_handle) {
      const user = await prisma.human.findUnique({
        where: { handle: body.data.user_handle },
        select: { id: true },
      });
      if (user) {
        const anomalyCall = result.toolCallLog.find(
          (tc) => tc.tool === "analyze_anomaly"
        );
        await prisma.anomalyAlert.create({
          data: {
            humanId: user.id,
            traceId: result.traceId,
            severity: (anomalyCall?.result?.urgency as string) || "routine",
            anomalyScore: (body.data.anomaly_score as number) || 0,
            flagsJson: JSON.stringify(body.data.flags || []),
            decisionJson: anomalyCall ? JSON.stringify(anomalyCall.result) : "{}",
            evidenceJson,
            status: "active",
          },
        });
      }
    }

    return NextResponse.json({ ...result, evidenceJson });
  } catch (err) {
    console.error("[/api/trigger] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
