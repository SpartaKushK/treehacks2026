import { z } from "zod";

/* ── Registry ── */

export const RegisterBodySchema = z.object({
  handle: z.string().min(1),
  endpointUrl: z.string().url(),
  publicKey: z.string().min(1),
  displayName: z.string().min(1),
});

/* ── Invoke ── */

export const InvokePayloadSchema = z.object({
  capability: z.string().min(1),
  scopes: z.array(z.string()),
  input: z.unknown(),
  nonce: z.string().min(1),
  timestamp: z.number(),
});

/* ── Scheduling ── */

export const TimeSlotSchema = z.object({
  start: z.string(),
  end: z.string(),
});

export const ScheduleProposeInputSchema = z.object({
  title: z.string(),
  durationMins: z.number().int().positive(),
  timeWindow: TimeSlotSchema,
  locationPrefs: z.array(z.string()),
});

export const ScheduleConfirmInputSchema = z.object({
  chosenSlot: TimeSlotSchema,
  title: z.string(),
  participants: z.array(z.string()),
});

/* ── Health ── */

export const HealthSummaryOutputSchema = z.object({
  rangeDays: z.number(),
  sleep: z.object({
    avg: z.number(),
    trend: z.enum(["up", "down", "flat"]),
    flags: z.array(z.string()),
  }),
  activity: z.object({
    avgSteps: z.number(),
    trend: z.enum(["up", "down", "flat"]),
  }),
  medication: z.object({
    adherencePct: z.number(),
    missedDays: z.number(),
  }),
  symptoms: z.object({
    avgScore: z.number(),
    spikes: z.array(z.string()),
  }),
  notes: z.array(z.string()),
  patientFriendlyText: z.string().optional(),
});

/* ── LLM planner output schemas ── */

export const PlannerScheduleOutputSchema = z.object({
  action: z.enum(["propose", "counter", "confirm"]),
  args: z.unknown(),
  message: z.string(),
});

export const PlannerHealthExplainSchema = z.object({
  patientFriendlyText: z.string(),
});
