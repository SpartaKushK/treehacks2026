import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { prisma } from "@/lib/store";
import { ensureSeed } from "@/lib/ensureSeed";
import { triggerAnomalyPipeline } from "@/lib/anomaly/triggerPipeline";
import type { HealthAnomalyAlert } from "@people/shared";

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

const PIPELINE_THRESHOLD = 50;

export async function POST(req: NextRequest) {
  try {
    await ensureSeed();

    const body: HealthDataPayload & { deviceId?: string; userHandle?: string } = await req.json();
    const supabase = getSupabase();

    const deviceId = body.deviceId ?? "unknown";
    const userHandle = body.userHandle || "pari";
    const dateStr = body.exportDate.split("T")[0];

    console.log(`[health-data] Received upload from ${userHandle} (device: ${deviceId})`);

    // ═══════════════════════════════════════════════════════════════════
    // STEP 1: Store RAW data in Supabase (source of truth)
    // ═══════════════════════════════════════════════════════════════════

    // 1a. Create upload tracking record
    const { data: upload, error: uploadErr } = await supabase
      .from("health_uploads")
      .insert({ device_id: deviceId, export_date: body.exportDate })
      .select("id")
      .single();

    if (uploadErr || !upload) {
      console.error("Failed to create health_upload:", uploadErr);
      return NextResponse.json(
        { error: "Failed to create upload record", details: uploadErr?.message },
        { status: 500 }
      );
    }

    const uploadId = upload.id;
    console.log(`[health-data] Created upload record: ${uploadId}`);

    // 1b. Insert all raw health data in parallel
    const inserts = await Promise.allSettled([
      body.steps.length > 0
        ? supabase.from("steps").insert(
            body.steps.map((s) => ({
              upload_id: uploadId,
              date: s.date,
              step_count: s.stepCount,
            }))
          )
        : Promise.resolve({ error: null }),

      body.heartRates.length > 0
        ? supabase.from("heart_rates").insert(
            body.heartRates.map((h) => ({
              upload_id: uploadId,
              start_date: h.startDate,
              end_date: h.endDate,
              bpm: h.bpm,
            }))
          )
        : Promise.resolve({ error: null }),

      body.sleepSamples.length > 0
        ? supabase.from("sleep_samples").insert(
            body.sleepSamples.map((s) => ({
              upload_id: uploadId,
              start_date: s.startDate,
              end_date: s.endDate,
              sleep_stage: s.sleepStage,
            }))
          )
        : Promise.resolve({ error: null }),

      body.activeEnergy.length > 0
        ? supabase.from("active_energy").insert(
            body.activeEnergy.map((a) => ({
              upload_id: uploadId,
              date: a.date,
              kilocalories: a.kilocalories,
            }))
          )
        : Promise.resolve({ error: null }),

      body.distances.length > 0
        ? supabase.from("distances").insert(
            body.distances.map((d) => ({
              upload_id: uploadId,
              date: d.date,
              distance_meters: d.distanceMeters,
            }))
          )
        : Promise.resolve({ error: null }),

      body.workouts.length > 0
        ? supabase.from("workouts").insert(
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
        ? supabase.from("weights").insert(
            body.weights.map((w) => ({
              upload_id: uploadId,
              date: w.date,
              weight_kg: w.weightKg,
            }))
          )
        : Promise.resolve({ error: null }),

      body.heights.length > 0
        ? supabase.from("heights").insert(
            body.heights.map((h) => ({
              upload_id: uploadId,
              date: h.date,
              height_cm: h.heightCm,
            }))
          )
        : Promise.resolve({ error: null }),

      body.healthEvents.length > 0
        ? supabase.from("health_events").insert(
            body.healthEvents.map((e) => ({
              upload_id: uploadId,
              event_type: e.eventType,
              start_date: e.startDate,
              end_date: e.endDate,
            }))
          )
        : Promise.resolve({ error: null }),
    ]);

    const failures = inserts.filter(
      (r) =>
        r.status === "rejected" ||
        (r.status === "fulfilled" && r.value && "error" in r.value && r.value.error)
    );

    if (failures.length > 0) {
      console.error("Some Supabase inserts failed:", failures);
    } else {
      console.log(`[health-data] Successfully stored raw data in Supabase`);
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 2: Aggregate raw data into daily summary
    // ═══════════════════════════════════════════════════════════════════

    const metrics = aggregateMetrics(body);
    console.log(`[health-data] Aggregated metrics:`, metrics);

    // ═══════════════════════════════════════════════════════════════════
    // STEP 3: Store summary in Prisma HealthMetric (for fast queries)
    // ═══════════════════════════════════════════════════════════════════

    const user = await prisma.human.findUnique({ where: { handle: userHandle } });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const healthMetric = await prisma.healthMetric.create({
      data: {
        humanId: user.id,
        date: dateStr,
        sleepHours: metrics.sleepHours,
        steps: metrics.steps,
        medAdherence: true, // no med data from HealthKit, assume true
        symptomScore: metrics.symptomScore,
      },
    });

    console.log(`[health-data] Created HealthMetric: ${healthMetric.id}`);

    // ═══════════════════════════════════════════════════════════════════
    // STEP 4: Anomaly detection and agent pipeline
    // ═══════════════════════════════════════════════════════════════════

    // Fetch baseline from last 28 days
    const baseline = await computeBaseline(user.id);
    const flags = detectFlags(metrics, baseline);
    const anomalyScore = computeAnomalyScore(metrics, flags);

    console.log(`[health-data] Anomaly score: ${anomalyScore}, flags:`, flags);

    let pipelineResult = null;
    if (anomalyScore >= PIPELINE_THRESHOLD) {
      console.log(`[health-data] Score >= ${PIPELINE_THRESHOLD}, triggering agent pipeline...`);

      const anomaly: HealthAnomalyAlert = {
        user_handle: userHandle,
        date: dateStr,
        baseline_window_days: 28,
        metrics: {
          sleep_hours: metrics.sleepHours,
          resting_hr_bpm: metrics.restingHrBpm || undefined,
          steps: metrics.steps,
        },
        baseline: {
          sleep_mean: baseline.sleepMean,
          sleep_std: baseline.sleepStd,
          rhr_mean: baseline.hrMean,
          rhr_std: baseline.hrStd,
          steps_mean: baseline.stepsMean,
          steps_std: baseline.stepsStd,
        },
        flags,
        anomaly_score: anomalyScore,
        freeform_context: body.healthEvents.length > 0
          ? `Health events: ${body.healthEvents.map((e) => e.eventType).join(", ")}`
          : undefined,
      };

      try {
        pipelineResult = await triggerAnomalyPipeline(anomaly, userHandle);
        console.log(`[health-data] Pipeline complete. Trace ID: ${pipelineResult.traceId}`);
      } catch (err) {
        console.error("Anomaly pipeline error (non-fatal):", err);
      }
    }

    return NextResponse.json({
      uploadId,
      healthMetricId: healthMetric.id,
      status: "ok",
      rawDataStored: failures.length === 0,
      anomaly: {
        score: anomalyScore,
        flags,
        pipelineTriggered: anomalyScore >= PIPELINE_THRESHOLD,
        traceId: pipelineResult?.traceId ?? null,
        urgency: pipelineResult?.decision?.urgency ?? null,
      },
    });
  } catch (err) {
    console.error("Health data upload error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request" },
      { status: 400 }
    );
  }
}

/* ═══════════════════════════════════════════════════════════════════
   AGGREGATION LOGIC
   ═══════════════════════════════════════════════════════════════════ */

interface AggregatedMetrics {
  sleepHours: number;
  steps: number;
  restingHrBpm: number;
  symptomScore: number;
}

function aggregateMetrics(data: HealthDataPayload): AggregatedMetrics {
  // Sleep: sum durations of actual sleep stages (exclude inBed and awake)
  const sleepStages = new Set(["asleep", "core", "deep", "rem"]);
  let sleepMs = 0;
  for (const s of data.sleepSamples) {
    if (sleepStages.has(s.sleepStage)) {
      const start = new Date(s.startDate).getTime();
      const end = new Date(s.endDate).getTime();
      sleepMs += end - start;
    }
  }
  const sleepHours = sleepMs / (1000 * 60 * 60);

  // Steps: sum all step records
  const steps = data.steps.reduce((sum, s) => sum + s.stepCount, 0);

  // Heart rate: average BPM
  let restingHrBpm = 0;
  if (data.heartRates.length > 0) {
    restingHrBpm = data.heartRates.reduce((sum, h) => sum + h.bpm, 0) / data.heartRates.length;
  }

  // Symptom score: derived from health events
  let symptomScore = 1; // baseline normal
  for (const e of data.healthEvents) {
    if (e.eventType.includes("irregularHeartRhythm")) symptomScore += 4;
    else if (e.eventType.includes("highHeartRate")) symptomScore += 3;
    else if (e.eventType.includes("lowHeartRate")) symptomScore += 2;
    else symptomScore += 1;
  }
  symptomScore = Math.min(10, symptomScore);

  return {
    sleepHours: Math.round(sleepHours * 10) / 10,
    steps: Math.round(steps),
    restingHrBpm: Math.round(restingHrBpm * 10) / 10,
    symptomScore: Math.round(symptomScore * 10) / 10,
  };
}

/* ═══════════════════════════════════════════════════════════════════
   BASELINE COMPUTATION (from Prisma HealthMetric)
   ═══════════════════════════════════════════════════════════════════ */

interface Baseline {
  sleepMean: number;
  sleepStd: number;
  hrMean: number;
  hrStd: number;
  stepsMean: number;
  stepsStd: number;
}

async function computeBaseline(humanId: string): Promise<Baseline> {
  const twentyEightDaysAgo = new Date();
  twentyEightDaysAgo.setDate(twentyEightDaysAgo.getDate() - 28);
  const cutoff = twentyEightDaysAgo.toISOString().split("T")[0];

  const metrics = await prisma.healthMetric.findMany({
    where: {
      humanId,
      date: { gte: cutoff },
    },
    orderBy: { date: "desc" },
  });

  if (metrics.length < 2) {
    return {
      sleepMean: 7.0,
      sleepStd: 1.0,
      hrMean: 65,
      hrStd: 5,
      stepsMean: 7000,
      stepsStd: 2000,
    };
  }

  const sleepValues = metrics.map((m) => m.sleepHours);
  const stepsValues = metrics.map((m) => m.steps);

  return {
    sleepMean: mean(sleepValues),
    sleepStd: std(sleepValues),
    hrMean: 65, // default (extend schema if needed)
    hrStd: 5,
    stepsMean: mean(stepsValues),
    stepsStd: std(stepsValues),
  };
}

/* ═══════════════════════════════════════════════════════════════════
   ANOMALY DETECTION
   ═══════════════════════════════════════════════════════════════════ */

function detectFlags(metrics: AggregatedMetrics, baseline: Baseline): string[] {
  const flags: string[] = [];

  if (metrics.sleepHours < baseline.sleepMean - 1.5 * baseline.sleepStd) {
    flags.push("SLEEP_DROP");
  }
  if (metrics.restingHrBpm > 0 && metrics.restingHrBpm > baseline.hrMean + 1.5 * baseline.hrStd) {
    flags.push("RHR_SPIKE");
  }
  if (metrics.steps < baseline.stepsMean - 1.5 * baseline.stepsStd) {
    flags.push("STEPS_DROP");
  }
  if (metrics.symptomScore >= 5) {
    flags.push("SYMPTOM_SPIKE");
  }

  return flags;
}

function computeAnomalyScore(metrics: AggregatedMetrics, flags: string[]): number {
  let score = 0;

  if (metrics.sleepHours < 5) score += 30;
  else if (metrics.sleepHours < 6) score += 15;

  if (metrics.restingHrBpm > 90) score += 25;
  else if (metrics.restingHrBpm > 80) score += 15;

  if (metrics.steps < 3000) score += 20;
  else if (metrics.steps < 5000) score += 10;

  if (metrics.symptomScore > 7) score += 25;
  else if (metrics.symptomScore > 5) score += 15;
  else if (metrics.symptomScore > 3) score += 5;

  if (flags.length >= 3) score += 10;
  else if (flags.length >= 2) score += 5;

  return Math.min(100, score);
}

/* ═══════════════════════════════════════════════════════════════════
   MATH HELPERS
   ═══════════════════════════════════════════════════════════════════ */

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function std(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const variance = arr.reduce((sum, v) => sum + (v - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}
