/**
 * Secretary Agent — Tool Definitions
 *
 * Each tool wraps an existing capability handler so the secretary LLM
 * can invoke it via function-calling. The secretary never does domain
 * logic itself — it delegates everything here.
 */

import { handleHealthAnomalyAlert } from "../capabilities/healthAnomalyAlert";
import { handleTriageIntakeAndSchedule } from "../capabilities/triageIntakeAndSchedule";
import { handleCapability } from "../people";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema object
  execute: (
    args: Record<string, unknown>,
    ctx: ToolContext,
  ) => Promise<Record<string, unknown>>;
}

export interface ToolContext {
  traceId: string;
  provider: "openai" | "claude";
  /** Original trigger data — tools can use this to fill in missing fields */
  triggerData?: Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/*  Tool: analyze_anomaly                                              */
/* ------------------------------------------------------------------ */

const analyzeAnomaly: ToolDefinition = {
  name: "analyze_anomaly",
  description:
    "Analyze a health anomaly alert from a patient's wearable data. " +
    "Evaluates severity, determines urgency, and decides whether the " +
    "patient should contact a clinic. Returns a structured decision.",
  parameters: {
    type: "object",
    properties: {
      user_handle: {
        type: "string",
        description: "The patient's handle (e.g. 'pari')",
      },
      date: {
        type: "string",
        description: "ISO date of the anomaly (e.g. '2026-02-14')",
      },
      baseline_window_days: {
        type: "number",
        description: "Number of days used for the baseline window",
      },
      metrics: {
        type: "object",
        description: "Current readings from the wearable",
        properties: {
          sleep_hours: { type: "number" },
          resting_hr_bpm: { type: "number" },
          steps: { type: "number" },
          hrv_ms: { type: "number" },
        },
      },
      baseline: {
        type: "object",
        description: "Baseline statistics for comparison",
        properties: {
          sleep_mean: { type: "number" },
          sleep_std: { type: "number" },
          rhr_mean: { type: "number" },
          rhr_std: { type: "number" },
          steps_mean: { type: "number" },
          steps_std: { type: "number" },
        },
      },
      flags: {
        type: "array",
        items: { type: "string" },
        description: "List of anomaly flags (e.g. 'low_sleep', 'high_resting_hr')",
      },
      anomaly_score: {
        type: "number",
        description: "Anomaly score from 0-100 (higher = more anomalous)",
      },
      freeform_context: {
        type: "string",
        description: "Optional freeform context about the anomaly",
      },
    },
    required: [
      "user_handle",
      "date",
      "baseline_window_days",
      "metrics",
      "baseline",
      "flags",
      "anomaly_score",
    ],
  },

  async execute(args, ctx) {
    const result = await handleHealthAnomalyAlert(args, ctx.traceId, ctx.provider);
    if (!result.ok) {
      return { error: true, ...(result.data as Record<string, unknown>) };
    }
    const data = result.data as { decision: Record<string, unknown> };
    return { error: false, ...data.decision };
  },
};

/* ------------------------------------------------------------------ */
/*  Tool: triage_patient                                               */
/* ------------------------------------------------------------------ */

const triagePatient: ToolDefinition = {
  name: "triage_patient",
  description:
    "Send a triage request to a doctor's receptionist agent. Handles " +
    "intake questions, assesses urgency, and books an appointment if needed. " +
    "Use this after analyze_anomaly indicates the patient should contact a clinic.",
  parameters: {
    type: "object",
    properties: {
      patient_handle: {
        type: "string",
        description: "The patient's handle",
      },
      anomaly: {
        type: "object",
        description:
          "The original anomaly alert data (pass through from analyze_anomaly input)",
      },
      urgency: {
        type: "string",
        enum: ["routine", "soon", "urgent"],
        description: "Urgency level determined by the anomaly analysis",
      },
      message: {
        type: "string",
        description:
          "Message to the clinic describing why the patient needs to be seen",
      },
      patient_answers: {
        type: "object",
        description: "Optional pre-filled intake answers (key-value pairs)",
      },
    },
    required: ["patient_handle", "anomaly", "urgency", "message"],
  },

  async execute(args, ctx) {
    // The LLM often omits the full anomaly object. If missing, fill from trigger context.
    if (!args.anomaly && ctx.triggerData) {
      args.anomaly = ctx.triggerData;
    }
    const result = await handleTriageIntakeAndSchedule(args, ctx.traceId, ctx.provider);
    if (!result.ok) {
      return { error: true, ...(result.data as Record<string, unknown>) };
    }
    const data = result.data as { outcome: Record<string, unknown> };
    return { error: false, ...data.outcome };
  },
};

/* ------------------------------------------------------------------ */
/*  Tool: get_health_summary                                           */
/* ------------------------------------------------------------------ */

const getHealthSummary: ToolDefinition = {
  name: "get_health_summary",
  description:
    "Retrieve a 30-day health summary for a patient. Includes sleep, " +
    "activity, medication adherence, and symptom trends. Useful for " +
    "getting context before making triage decisions.",
  parameters: {
    type: "object",
    properties: {
      patient_handle: {
        type: "string",
        description: "The patient's handle (e.g. 'pari')",
      },
    },
    required: ["patient_handle"],
  },

  async execute(args) {
    const result = await handleCapability(
      args.patient_handle as string,
      "health_summary",
      { patientHandle: args.patient_handle },
    );
    if (!result.ok) {
      return { error: true, ...(result.data as Record<string, unknown>) };
    }
    return { error: false, ...(result.data as Record<string, unknown>) };
  },
};

/* ------------------------------------------------------------------ */
/*  Tool: schedule_appointment                                         */
/* ------------------------------------------------------------------ */

const scheduleAppointment: ToolDefinition = {
  name: "schedule_appointment",
  description:
    "Propose and find available scheduling slots for a meeting between " +
    "two parties. Returns available time slots based on calendar availability.",
  parameters: {
    type: "object",
    properties: {
      callee_handle: {
        type: "string",
        description: "Handle of the person to schedule with",
      },
      title: {
        type: "string",
        description: "Title/reason for the appointment",
      },
      duration_mins: {
        type: "number",
        description: "Duration in minutes (default 30)",
      },
      time_window: {
        type: "object",
        description: "Time window to search for slots",
        properties: {
          start: { type: "string", description: "ISO start timestamp" },
          end: { type: "string", description: "ISO end timestamp" },
        },
        required: ["start", "end"],
      },
    },
    required: ["callee_handle", "title"],
  },

  async execute(args) {
    // Default time window: next 5 business days
    const now = new Date();
    const start = args.time_window
      ? (args.time_window as { start: string }).start
      : now.toISOString();
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + 7);
    const end = args.time_window
      ? (args.time_window as { end: string }).end
      : endDate.toISOString();

    const result = await handleCapability(
      args.callee_handle as string,
      "schedule_propose",
      {
        title: args.title,
        durationMins: args.duration_mins || 30,
        timeWindow: { start, end },
        locationPrefs: [],
      },
    );
    if (!result.ok) {
      return { error: true, ...(result.data as Record<string, unknown>) };
    }
    return { error: false, ...(result.data as Record<string, unknown>) };
  },
};

/* ------------------------------------------------------------------ */
/*  Export all tools                                                    */
/* ------------------------------------------------------------------ */

export const ALL_TOOLS: ToolDefinition[] = [
  analyzeAnomaly,
  triagePatient,
  getHealthSummary,
  scheduleAppointment,
];

/**
 * Convert our tool definitions into the OpenAI function-calling format.
 */
export function toOpenAITools() {
  return ALL_TOOLS.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

/**
 * Convert our tool definitions into the Anthropic tool-use format.
 */
export function toAnthropicTools() {
  return ALL_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));
}

/**
 * Look up a tool by name and execute it.
 */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<Record<string, unknown>> {
  const tool = ALL_TOOLS.find((t) => t.name === name);
  if (!tool) {
    return { error: true, message: `Unknown tool: ${name}` };
  }
  return tool.execute(args, ctx);
}
