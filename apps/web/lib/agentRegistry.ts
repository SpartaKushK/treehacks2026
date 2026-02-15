import { z } from "zod";

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
const doctorProxy = `${baseUrl}/api/doctor/alert`;
const patientAgentUrl =
  process.env.PATIENT_AGENT_URL || `${baseUrl}/api/patient/agent`;

export type AgentRegistryEntry = {
  id: string;
  displayName: string;
  role: string;
  endpoint: string;
  method: "POST" | "GET";
  expects: string;
  payloadExample?: Record<string, unknown>;
  notes?: string;
};

export const AGENT_REGISTRY: AgentRegistryEntry[] = [
  {
    id: "secretary_orchestrator",
    displayName: "Secretary Agent",
    role:
      "Top-level orchestrator for health triggers; delegates to health and scheduling sub-agents.",
    endpoint: `${baseUrl}/api/trigger`,
    method: "POST",
    expects:
      "JSON body { trigger_type: 'health_anomaly' | 'health_summary' | 'schedule' | 'custom', data: object, description?: string }",
    payloadExample: {
      trigger_type: "health_anomaly",
      description: "Wearable alert for pari",
      data: {
        user_handle: "pari",
        date: "2026-02-14",
        anomaly_score: 92,
        flags: ["SLEEP_DROP", "RHR_SPIKE"],
        metrics: { sleep_hours: 4.1, resting_hr_bpm: 88, steps: 2100 },
        baseline: { sleep_mean: 7.1, rhr_mean: 62, steps_mean: 7500 },
      },
    },
  },
  {
    id: "health_agent",
    displayName: "Health Sub-Agent",
    role:
      "Analyzes anomalies, summaries, triage, and clinical evidence. Exposed as internal tools (analyze_anomaly, triage_patient, get_health_summary, lookup_clinical_evidence).",
    endpoint: "internal:tool",
    method: "POST",
    expects:
      "Use via tool-calling; primary input fields mirror HealthAnomalyAlertSchema and TriageRequestSchema.",
  },
  {
    id: "scheduler_agent",
    displayName: "Scheduler Sub-Agent",
    role:
      "Finds availability and books appointments using Google Calendar/local store. Exposed as internal tool schedule_appointment.",
    endpoint: "internal:tool",
    method: "POST",
    expects:
      "Use via tool-calling; requires user_handle, title, urgency, duration_mins?, method?, description?.",
  },
  {
    id: "doctor_agent",
    displayName: "Doctor Agent (Python)",
    role:
      "External doctor triage + scheduling service. Receives health alerts and runs its own triage/scheduling pipeline.",
    endpoint: doctorProxy,
    method: "POST",
    expects:
      "HealthAlert payload with patient + alert details; patient_agent_url is required for slot proposals.",
    payloadExample: {
      patient_id: "pari",
      patient_name: "Pari",
      patient_email: "pari@example.com",
      alert_type: "elevated_heart_rate",
      metric_value: 142,
      metric_unit: "bpm",
      threshold_value: 100,
      description: "Resting heart rate 142 bpm detected",
      patient_agent_url: patientAgentUrl,
    },
    notes:
      "Requests are proxied through /api/doctor/alert. patient_agent_url defaults to /api/patient/agent if not provided. Set DOCTOR_AGENT_URL to the Python service; set DOCTOR_AGENT_FALLBACK=false to disable mock responses.",
  },
];

export function renderAgentRegistry(): string {
  return AGENT_REGISTRY.map((entry) => {
    const example = entry.payloadExample
      ? `Example: ${JSON.stringify(entry.payloadExample)}`
      : "";
    return `- ${entry.displayName} (${entry.id}) - ${entry.role}\n  Endpoint: ${entry.endpoint} [${entry.method}]\n  Expects: ${entry.expects}${
      example ? `\n  ${example}` : ""
    }${entry.notes ? `\n  Notes: ${entry.notes}` : ""}`;
  }).join("\n\n");
}

export const DoctorAlertSchema = z.object({
  patient_id: z.string(),
  patient_name: z.string(),
  patient_email: z.string().email(),
  alert_type: z.string(),
  metric_value: z.number().optional(),
  metric_unit: z.string().optional(),
  threshold_value: z.number().optional(),
  description: z.string(),
  patient_agent_url: z.string().url(),
  preferred_days: z.array(z.string()).optional(),
  preferred_time_of_day: z
    .enum(["morning", "afternoon", "evening"])
    .optional(),
  patient_phone: z.string().optional(),
  timestamp: z.string().optional(),
});
