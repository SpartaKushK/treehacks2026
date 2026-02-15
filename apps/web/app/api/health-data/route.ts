import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { processUpload } from "@/lib/anomaly/processUpload";

// Shape matching iOS HealthDataPayload (dates arrive as ISO-8601 strings)
interface HealthDataPayload {
  exportDate: string;
  steps: { date: string; stepCount: number }[];
  heartRates: { startDate: string; endDate: string; bpm: number }[];
  sleepSamples: { startDate: string; endDate: string; sleepStage: string }[];
  activeEnergy: { date: string; kilocalories: number }[];
  distances: { date: string; distanceMeters: number }[];
  workouts: {
    startDate: string;
    endDate: string;
    activityType: string;
    durationSeconds: number;
    totalEnergyKcal: number | null;
    totalDistanceMeters: number | null;
  }[];
  weights: { date: string; weightKg: number }[];
  heights: { date: string; heightCm: number }[];
  healthEvents: { eventType: string; startDate: string; endDate: string }[];
}

export async function POST(req: NextRequest) {
  try {
    const body: HealthDataPayload & { deviceId?: string; userHandle?: string } = await req.json();

    const deviceId = body.deviceId ?? "unknown";

    // 1. Create upload record
    const { data: upload, error: uploadErr } = await getSupabase()
      .from("health_uploads")
      .insert({ device_id: deviceId, export_date: body.exportDate })
      .select("id")
      .single();

    if (uploadErr || !upload) {
      console.error("Failed to create upload:", uploadErr);
      return NextResponse.json(
        { error: "Failed to create upload record" },
        { status: 500 }
      );
    }

    const uploadId = upload.id;

    // 2. Insert all health data in parallel
    const inserts = await Promise.allSettled([
      body.steps.length > 0
        ? getSupabase().from("steps").insert(
            body.steps.map((s) => ({
              upload_id: uploadId,
              date: s.date,
              step_count: s.stepCount,
            }))
          )
        : Promise.resolve({ error: null }),

      body.heartRates.length > 0
        ? getSupabase().from("heart_rates").insert(
            body.heartRates.map((h) => ({
              upload_id: uploadId,
              start_date: h.startDate,
              end_date: h.endDate,
              bpm: h.bpm,
            }))
          )
        : Promise.resolve({ error: null }),

      body.sleepSamples.length > 0
        ? getSupabase().from("sleep_samples").insert(
            body.sleepSamples.map((s) => ({
              upload_id: uploadId,
              start_date: s.startDate,
              end_date: s.endDate,
              sleep_stage: s.sleepStage,
            }))
          )
        : Promise.resolve({ error: null }),

      body.activeEnergy.length > 0
        ? getSupabase().from("active_energy").insert(
            body.activeEnergy.map((a) => ({
              upload_id: uploadId,
              date: a.date,
              kilocalories: a.kilocalories,
            }))
          )
        : Promise.resolve({ error: null }),

      body.distances.length > 0
        ? getSupabase().from("distances").insert(
            body.distances.map((d) => ({
              upload_id: uploadId,
              date: d.date,
              distance_meters: d.distanceMeters,
            }))
          )
        : Promise.resolve({ error: null }),

      body.workouts.length > 0
        ? getSupabase().from("workouts").insert(
            body.workouts.map((w) => ({
              upload_id: uploadId,
              start_date: w.startDate,
              end_date: w.endDate,
              activity_type: w.activityType,
              duration_seconds: w.durationSeconds,
              total_energy_kcal: w.totalEnergyKcal,
              total_distance_meters: w.totalDistanceMeters,
            }))
          )
        : Promise.resolve({ error: null }),

      body.weights.length > 0
        ? getSupabase().from("weights").insert(
            body.weights.map((w) => ({
              upload_id: uploadId,
              date: w.date,
              weight_kg: w.weightKg,
            }))
          )
        : Promise.resolve({ error: null }),

      body.heights.length > 0
        ? getSupabase().from("heights").insert(
            body.heights.map((h) => ({
              upload_id: uploadId,
              date: h.date,
              height_cm: h.heightCm,
            }))
          )
        : Promise.resolve({ error: null }),

      body.healthEvents.length > 0
        ? getSupabase().from("health_events").insert(
            body.healthEvents.map((e) => ({
              upload_id: uploadId,
              event_type: e.eventType,
              start_date: e.startDate,
              end_date: e.endDate,
            }))
          )
        : Promise.resolve({ error: null }),
    ]);

    // Check for any failures
    const failures = inserts.filter(
      (r) =>
        r.status === "rejected" ||
        (r.status === "fulfilled" && r.value && "error" in r.value && r.value.error)
    );

    if (failures.length > 0) {
      console.error("Some inserts failed:", failures);
      return NextResponse.json(
        { uploadId, warning: `${failures.length} table insert(s) had errors` },
        { status: 207 }
      );
    }

    // 3. Run anomaly detection + agent pipeline
    let anomalyResult = null;
    try {
      anomalyResult = await processUpload({
        deviceId,
        userHandle: body.userHandle || "pari",
        exportDate: body.exportDate,
        steps: body.steps,
        heartRates: body.heartRates,
        sleepSamples: body.sleepSamples,
        healthEvents: body.healthEvents,
      });
    } catch (err) {
      console.error("Anomaly processing error (non-fatal):", err);
    }

    return NextResponse.json({
      uploadId,
      status: "ok",
      anomaly: anomalyResult
        ? {
            score: anomalyResult.anomalyScore,
            flags: anomalyResult.flags,
            pipelineTriggered: anomalyResult.pipelineTriggered,
            traceId: anomalyResult.traceId,
            urgency: anomalyResult.decision?.urgency ?? null,
          }
        : null,
    });
  } catch (err) {
    console.error("Health data upload error:", err);
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
}
