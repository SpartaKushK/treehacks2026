import { z } from "zod";

export const HealthAnomalyAlertSchema = z.object({
  user_handle: z.string(),
  date: z.string(),
  baseline_window_days: z.number(),
  metrics: z.object({
    sleep_hours: z.number().optional(),
    resting_hr_bpm: z.number().optional(),
    steps: z.number().optional(),
    hrv_ms: z.number().optional(),
  }),
  baseline: z.object({
    sleep_mean: z.number().optional(),
    sleep_std: z.number().optional(),
    rhr_mean: z.number().optional(),
    rhr_std: z.number().optional(),
    steps_mean: z.number().optional(),
    steps_std: z.number().optional(),
  }),
  flags: z.array(z.string()),
  anomaly_score: z.number().min(0).max(100),
  freeform_context: z.string().optional(),
});

export type HealthAnomalyAlert = z.infer<typeof HealthAnomalyAlertSchema>;

export const PatientDecisionSchema = z.object({
  summary_explanation: z.string(),
  questions: z.array(z.string()),
  recommended_next_step: z.string(),
  should_contact_clinic: z.boolean(),
  urgency: z.enum(["routine", "soon", "urgent"]),
  clinic_message: z.string().optional(),
});

export type PatientDecision = z.infer<typeof PatientDecisionSchema>;
