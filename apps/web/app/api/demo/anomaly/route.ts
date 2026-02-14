import { NextRequest, NextResponse } from "next/server";
import { ensureSeed } from "@/lib/ensureSeed";
import { triggerAnomalyPipeline } from "@/lib/anomaly/triggerPipeline";
import type { Provider } from "@/lib/llm";
import type { HealthAnomalyAlert } from "@people/shared";

export async function GET(req: NextRequest) {
  await ensureSeed();

  const url = new URL(req.url);
  const severity = url.searchParams.get("severity") || "severe";
  const provider = (url.searchParams.get("provider") || "claude") as Provider;

  // Build sample anomaly payload
  const anomaly: HealthAnomalyAlert = severity === "severe"
    ? {
        user_handle: "pari",
        date: new Date().toISOString().split("T")[0],
        baseline_window_days: 28,
        metrics: { sleep_hours: 4.2, resting_hr_bpm: 88, steps: 2100, hrv_ms: 22 },
        baseline: { sleep_mean: 7.1, sleep_std: 0.6, rhr_mean: 62, rhr_std: 3, steps_mean: 7500, steps_std: 1200 },
        flags: ["SLEEP_DROP", "RHR_SPIKE", "STEPS_DROP", "HRV_DROP"],
        anomaly_score: 92,
        freeform_context: "Feeling very tired and heart racing since yesterday.",
      }
    : {
        user_handle: "pari",
        date: new Date().toISOString().split("T")[0],
        baseline_window_days: 28,
        metrics: { sleep_hours: 5.8, resting_hr_bpm: 68, steps: 5200 },
        baseline: { sleep_mean: 7.1, sleep_std: 0.6, rhr_mean: 62, rhr_std: 3, steps_mean: 7500, steps_std: 1200 },
        flags: ["SLEEP_DROP"],
        anomaly_score: 55,
      };

  try {
    const result = await triggerAnomalyPipeline(anomaly, "pari", provider);

    return NextResponse.json({
      traceId: result.traceId,
      severity,
      provider,
      decision: result.decision,
      triage_outcome: result.triageOutcome,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "orchestration_failed", detail: String(err) },
      { status: 500 }
    );
  }
}
