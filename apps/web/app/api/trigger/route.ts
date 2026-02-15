import { NextRequest, NextResponse } from "next/server";
import { ensureSeed } from "@/lib/ensureSeed";
import { PlannerAgent } from "@/lib/agents";

/**
 * POST /api/trigger
 *
 * Open endpoint that accepts health trigger data and routes it through
 * the Planner Agent. The planner uses LLM function-calling to delegate
 * to specialized sub-agents (HealthAgent, SchedulerAgent) and returns
 * a final decision.
 *
 * Body:
 * {
 *   "trigger_type": "health_anomaly" | "health_summary" | "schedule" | "custom",
 *   "provider": "openai" | "claude",        // optional, defaults to "claude"
 *   "data": { ... trigger-specific payload },
 *   "description": "optional description"
 * }
 *
 * Response:
 * {
 *   "traceId": "uuid",
 *   "finalDecision": "Planner's summary ...",
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
      body.provider === "openai" ? "openai" : "claude";

    // Use new class-based PlannerAgent architecture
    const planner = new PlannerAgent({ provider });

    const plannerResult = await planner.run(body.data, {
      traceId: "", // Will be created by PlannerAgent
      provider,
      userHandle: (body.data.user_handle as string) || "unknown",
      triggerData: body.data,
    });

    // Return result
    const result = {
      traceId: plannerResult.traceId || "",
      finalDecision: (plannerResult.data.finalDecision as string) || "",
      toolCallLog: plannerResult.toolCalls || [],
      provider,
      turns: plannerResult.turns || 0,
    };

    return NextResponse.json(result);
  } catch (err) {
    console.error("[/api/trigger] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
