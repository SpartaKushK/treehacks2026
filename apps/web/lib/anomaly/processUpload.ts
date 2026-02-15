import { getSupabase } from "../supabase";
import { prisma } from "../store";
import { ensureSeed } from "../ensureSeed";
import { triggerAnomalyPipeline } from "./triggerPipeline";
import type { HealthAnomalyAlert } from "@people/shared";

interface UploadData {
  deviceId: string;
  userHandle: string;
  exportDate: string;
  steps: { date: string; stepCount: number }[];
  heartRates: { startDate: string; endDate: string; bpm: number }[];
  sleepSamples: { startDate: string; endDate: string; sleepStage: string }[];
  healthEvents: { eventType: string; startDate: string; endDate: string }[];
}

interface AggregatedMetrics {
  sleepHours: number;
  steps: number;
  restingHrBpm: number;
  symptomScore: number;
}

// Threshold for triggering the agent pipeline (0-100)
const PIPELINE_THRESHOLD = 50;

/**
 * Process a health data upload: aggregate, compute baselines, detect anomalies,
 * write a HealthMetric record, and trigger the agent pipeline if warranted.
 */
export async function processUpload(data: UploadData) {
  await ensureSeed();

  const userHandle = data.userHandle || "pari";

  // 1. Aggregate raw data into daily metrics
  const metrics = aggregateMetrics(data);

  // 2. Write a HealthMetric to Prisma so the live dashboard works
  const user = await prisma.human.findUnique({ where: { handle: userHandle } });
  if (user) {
    const dateStr = data.exportDate.split("T")[0];
    await prisma.healthMetric.create({
      data: {
        humanId: user.id,
        date: dateStr,
        sleepHours: metrics.sleepHours,
        steps: Math.round(metrics.steps),
        medAdherence: true, // no med data from HealthKit, assume true
        symptomScore: metrics.symptomScore,
      },
    });
  }

  // 3. Fetch baseline from Supabase (last 28 days for this device)
  const baseline = await computeBaseline(data.deviceId);

  // 4. Detect flags and compute anomaly score
  const flags = detectFlags(metrics, baseline);
  const anomalyScore = computeAnomalyScore(metrics, flags);

  // 5. Build HealthAnomalyAlert
  const anomaly: HealthAnomalyAlert = {
    user_handle: userHandle,
    date: data.exportDate.split("T")[0],
    baseline_window_days: 28,
    metrics: {
      sleep_hours: metrics.sleepHours,
      resting_hr_bpm: metrics.restingHrBpm || undefined,
      steps: metrics.steps,
    },
    baseline: {
      sleep_mean: baseline.sleepMean || undefined,
      sleep_std: baseline.sleepStd || undefined,
      rhr_mean: baseline.hrMean || undefined,
      rhr_std: baseline.hrStd || undefined,
      steps_mean: baseline.stepsMean || undefined,
      steps_std: baseline.stepsStd || undefined,
    },
    flags,
    anomaly_score: anomalyScore,
    freeform_context: data.healthEvents.length > 0
      ? `Health events detected: ${data.healthEvents.map((e) => e.eventType).join(", ")}`
      : undefined,
  };

  // 6. If score meets threshold, trigger the full agent pipeline
  let pipelineResult = null;
  if (anomalyScore >= PIPELINE_THRESHOLD) {
    try {
      pipelineResult = await triggerAnomalyPipeline(anomaly, userHandle);
    } catch (err) {
      console.error("Anomaly pipeline error:", err);
    }
  }

  return {
    metrics,
    baseline,
    flags,
    anomalyScore,
    pipelineTriggered: anomalyScore >= PIPELINE_THRESHOLD,
    traceId: pipelineResult?.traceId ?? null,
    decision: pipelineResult?.decision ?? null,
  };
}

/** Aggregate raw HealthKit arrays into single daily values */
function aggregateMetrics(data: UploadData): AggregatedMetrics {
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
  // irregular heart rhythm = high concern, others contribute less
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

interface Baseline {
  sleepMean: number;
  sleepStd: number;
  hrMean: number;
  hrStd: number;
  stepsMean: number;
  stepsStd: number;
  hasSufficientData: boolean;
}

/** Fetch last 28 days of data from Supabase for this device and compute baselines */
async function computeBaseline(deviceId: string): Promise<Baseline> {
  const twentyEightDaysAgo = new Date();
  twentyEightDaysAgo.setDate(twentyEightDaysAgo.getDate() - 28);
  const cutoff = twentyEightDaysAgo.toISOString();

  // Get all upload IDs for this device in the baseline window
  const { data: uploads } = await getSupabase()
    .from("health_uploads")
    .select("id")
    .eq("device_id", deviceId)
    .gte("export_date", cutoff);

  if (!uploads || uploads.length < 2) {
    // Not enough historical data — return defaults
    return {
      sleepMean: 7.0,
      sleepStd: 1.0,
      hrMean: 65,
      hrStd: 5,
      stepsMean: 7000,
      stepsStd: 2000,
      hasSufficientData: false,
    };
  }

  const uploadIds = uploads.map((u) => u.id);

  // Fetch historical data in parallel
  const [stepsRes, hrRes, sleepRes] = await Promise.all([
    getSupabase().from("steps").select("step_count").in("upload_id", uploadIds),
    getSupabase().from("heart_rates").select("bpm").in("upload_id", uploadIds),
    getSupabase().from("sleep_samples").select("start_date, end_date, sleep_stage").in("upload_id", uploadIds),
  ]);

  // Steps baseline
  const stepValues = (stepsRes.data || []).map((s) => s.step_count);
  const stepsMean = mean(stepValues) || 7000;
  const stepsStd = std(stepValues) || 2000;

  // HR baseline
  const hrValues = (hrRes.data || []).map((h) => h.bpm);
  const hrMean = mean(hrValues) || 65;
  const hrStd = std(hrValues) || 5;

  // Sleep baseline — aggregate per upload
  const sleepStages = new Set(["asleep", "core", "deep", "rem"]);
  const sleepByUpload = new Map<string, number>();
  for (const s of sleepRes.data || []) {
    if (sleepStages.has(s.sleep_stage)) {
      const ms = new Date(s.end_date).getTime() - new Date(s.start_date).getTime();
      // We don't have upload_id in the select, so aggregate all
      const key = "all";
      sleepByUpload.set(key, (sleepByUpload.get(key) || 0) + ms);
    }
  }
  // Rough per-day average: total sleep / number of uploads
  const totalSleepHours = Array.from(sleepByUpload.values()).reduce((a, b) => a + b, 0) / (1000 * 60 * 60);
  const sleepMean = uploads.length > 0 ? totalSleepHours / uploads.length : 7.0;
  const sleepStd = 1.0; // simplified for now

  return {
    sleepMean: Math.round(sleepMean * 10) / 10,
    sleepStd: Math.round(sleepStd * 10) / 10,
    hrMean: Math.round(hrMean * 10) / 10,
    hrStd: Math.round(hrStd * 10) / 10,
    stepsMean: Math.round(stepsMean),
    stepsStd: Math.round(stepsStd),
    hasSufficientData: uploads.length >= 3,
  };
}

/** Detect anomaly flags comparing today's metrics to baseline */
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

/** Compute anomaly score (0-100) from metrics and flags */
function computeAnomalyScore(metrics: AggregatedMetrics, flags: string[]): number {
  let score = 0;

  // Sleep contribution (0-30)
  if (metrics.sleepHours < 5) score += 30;
  else if (metrics.sleepHours < 6) score += 15;

  // Heart rate contribution (0-25)
  if (metrics.restingHrBpm > 90) score += 25;
  else if (metrics.restingHrBpm > 80) score += 15;

  // Steps contribution (0-20)
  if (metrics.steps < 3000) score += 20;
  else if (metrics.steps < 5000) score += 10;

  // Symptom/event contribution (0-25)
  if (metrics.symptomScore > 7) score += 25;
  else if (metrics.symptomScore > 5) score += 15;
  else if (metrics.symptomScore > 3) score += 5;

  // Bonus for multiple flags
  if (flags.length >= 3) score += 10;
  else if (flags.length >= 2) score += 5;

  return Math.min(100, score);
}

/* ── Math helpers ── */
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
