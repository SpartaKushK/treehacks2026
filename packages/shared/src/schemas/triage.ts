import { z } from "zod";
import { HealthAnomalyAlertSchema } from "./health";

export const TriageRequestSchema = z.object({
  patient_handle: z.string(),
  anomaly: HealthAnomalyAlertSchema,
  patient_answers: z.record(z.string(), z.string()).optional(),
  urgency: z.enum(["routine", "soon", "urgent"]),
  message: z.string(),
});

export type TriageRequest = z.infer<typeof TriageRequestSchema>;

export const TriageOutcomeSchema = z.object({
  intake_questions_asked: z.array(z.string()),
  intake_answers: z.record(z.string(), z.string()),
  urgency: z.enum(["routine", "soon", "urgent"]),
  proposed_slots: z.array(
    z.object({ start: z.string(), end: z.string() })
  ),
  booking_confirmation: z.object({
    start: z.string(),
    end: z.string(),
    method: z.enum(["telehealth", "in_person"]),
  }),
  escalation_triggered: z.boolean(),
});

export type TriageOutcome = z.infer<typeof TriageOutcomeSchema>;
