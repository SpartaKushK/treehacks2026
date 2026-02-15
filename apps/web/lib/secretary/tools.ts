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
import { findAvailableSlots, bookCalendarEvent, getBusySlots } from "../google-calendar";
import { lookupClinicalEvidence } from "../clinical/evidenceService";
import { prisma } from "../store";
import { addStep } from "../trace";
import { saveToolInteraction, type AgentType } from "../memory";

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
    const userHandle = (args.user_handle as string) || "unknown";
    const result = await handleHealthAnomalyAlert(args, ctx.traceId, ctx.provider);

    const output = !result.ok
      ? { error: true, ...(result.data as Record<string, unknown>) }
      : { error: false, ...(result.data as { decision: Record<string, unknown> }).decision };

    // Save to health_anomaly agent's memory
    try {
      await saveToolInteraction("health_anomaly", userHandle, "analyze_anomaly", args, output);
    } catch (e) {
      console.warn("[analyze_anomaly] Failed to save memory:", e);
    }

    return output;
  },
};

/* ------------------------------------------------------------------ */
/*  Tool: triage_patient                                               */
/* ------------------------------------------------------------------ */

const triagePatient: ToolDefinition = {
  name: "triage_patient",
  description:
    "Evaluate and score the severity/urgency of a patient's health issues. " +
    "Performs intake questioning, assesses urgency based on anomaly data and " +
    "context, and determines whether the patient needs to be seen. Does NOT " +
    "handle scheduling — use schedule_appointment separately after this if " +
    "the triage indicates the patient should be seen.",
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
    const userHandle = (args.patient_handle as string) || "unknown";
    const result = await handleTriageIntakeAndSchedule(args, ctx.traceId, ctx.provider);

    const output = !result.ok
      ? { error: true, ...(result.data as Record<string, unknown>) }
      : { error: false, ...(result.data as { outcome: Record<string, unknown> }).outcome };

    // Save to triage agent's memory
    try {
      await saveToolInteraction("triage", userHandle, "triage_patient", args, output);
    } catch (e) {
      console.warn("[triage_patient] Failed to save memory:", e);
    }

    return output;
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

  async execute(args, ctx) {
    const userHandle = (args.patient_handle as string) || "unknown";
    const result = await handleCapability(
      args.patient_handle as string,
      "health_summary",
      { patientHandle: args.patient_handle },
    );

    const output = !result.ok
      ? { error: true, ...(result.data as Record<string, unknown>) }
      : { error: false, ...(result.data as Record<string, unknown>) };

    // Save to health_anomaly agent's memory (health summary is related)
    try {
      await saveToolInteraction("health_anomaly", userHandle, "get_health_summary", args, output);
    } catch (e) {
      console.warn("[get_health_summary] Failed to save memory:", e);
    }

    return output;
  },
};

/* ------------------------------------------------------------------ */
/*  Tool: schedule_appointment (Calendar Sub-Agent)                    */
/* ------------------------------------------------------------------ */

const scheduleAppointment: ToolDefinition = {
  name: "schedule_appointment",
  description:
    "The calendar scheduling sub-agent. Checks the user's real Google Calendar " +
    "(if connected) and local calendar for conflicts, finds genuinely free time " +
    "slots, books the best available slot, and creates the event on Google Calendar. " +
    "Use this whenever an appointment needs to be scheduled — after triage scoring " +
    "indicates the patient should be seen, or for any general scheduling needs. " +
    "This tool handles the entire scheduling workflow end-to-end.",
  parameters: {
    type: "object",
    properties: {
      user_handle: {
        type: "string",
        description: "Handle of the user whose calendar to check and book on",
      },
      title: {
        type: "string",
        description: "Title/reason for the appointment (e.g. 'Medical Appointment — urgent triage')",
      },
      urgency: {
        type: "string",
        enum: ["routine", "soon", "urgent"],
        description: "Urgency level — affects how soon the slot is searched (urgent=today, soon=1-2 days, routine=3+ days)",
      },
      duration_mins: {
        type: "number",
        description: "Duration in minutes (default 30)",
      },
      method: {
        type: "string",
        enum: ["in_person", "telehealth"],
        description: "Appointment method (default: in_person for urgent, telehealth for routine)",
      },
      description: {
        type: "string",
        description: "Optional description or notes for the calendar event",
      },
    },
    required: ["user_handle", "title", "urgency"],
  },

  async execute(args, ctx) {
    const handle = args.user_handle as string;
    const urgency = (args.urgency as string) || "routine";
    const durationMins = (args.duration_mins as number) || 30;
    const method = (args.method as string) || (urgency === "urgent" ? "in_person" : "telehealth");

    // 1. Resolve user
    const human = await prisma.human.findUnique({
      where: { handle },
      select: { id: true },
    });
    if (!human) {
      return { error: true, message: `User '${handle}' not found` };
    }

    // 2. Determine search window based on urgency
    const now = new Date();
    const dayOffset = urgency === "urgent" ? 0 : urgency === "soon" ? 1 : 3;
    const windowStart = new Date(now);
    windowStart.setDate(windowStart.getDate() + dayOffset);
    const windowEnd = new Date(now);
    windowEnd.setDate(windowEnd.getDate() + dayOffset + 7);

    addStep(ctx.traceId, {
      actor: "scheduling_agent",
      event: "CALENDAR_SEARCH_START",
      ok: true,
      data: {
        user: handle,
        urgency,
        windowStart: windowStart.toISOString(),
        windowEnd: windowEnd.toISOString(),
        durationMins,
      },
    });

    // 3. Find available slots from Google Calendar + local events
    const availableSlots = await findAvailableSlots(
      human.id,
      windowStart.toISOString(),
      windowEnd.toISOString(),
      durationMins,
      5
    );

    // Also get current busy events for context
    const busyEvents = await getBusySlots(
      human.id,
      windowStart.toISOString(),
      windowEnd.toISOString(),
    );

    addStep(ctx.traceId, {
      actor: "scheduling_agent",
      event: "AVAILABILITY_FOUND",
      ok: true,
      data: {
        freeSlots: availableSlots.length,
        busyEvents: busyEvents.length,
        slots: availableSlots,
      },
    });

    if (availableSlots.length === 0) {
      return {
        error: false,
        scheduled: false,
        message: `No available ${durationMins}-minute slots found in the next ${dayOffset + 7} days for '${handle}'. The user has ${busyEvents.length} events in that window.`,
        busy_event_count: busyEvents.length,
      };
    }

    // 4. Book the best (first available) slot
    const chosenSlot = availableSlots[0];

    const bookingResult = await bookCalendarEvent(human.id, {
      summary: args.title as string,
      start: chosenSlot.start,
      end: chosenSlot.end,
      description: (args.description as string) || `${args.title}. Urgency: ${urgency}. Method: ${method}.`,
    });

    addStep(ctx.traceId, {
      actor: "scheduling_agent",
      event: "APPOINTMENT_BOOKED",
      ok: true,
      data: {
        slot: chosenSlot,
        method,
        localId: bookingResult.localId,
        googleEventId: bookingResult.googleEventId,
        createdOnGoogle: !!bookingResult.googleEventId,
      },
    });

    const output = {
      error: false,
      scheduled: true,
      booking: {
        start: chosenSlot.start,
        end: chosenSlot.end,
        method,
        title: args.title,
      },
      google_calendar: bookingResult.googleEventId
        ? { synced: true, event_id: bookingResult.googleEventId }
        : { synced: false, reason: "Google Calendar not connected — saved locally" },
      alternative_slots: availableSlots.slice(1, 4),
      message: `Appointment booked: ${args.title} on ${new Date(chosenSlot.start).toLocaleDateString()} at ${new Date(chosenSlot.start).toLocaleTimeString()} (${method}).`,
    };

    // Save to scheduler agent's memory
    try {
      await saveToolInteraction("scheduler", handle, "schedule_appointment", args, output);
    } catch (e) {
      console.warn("[schedule_appointment] Failed to save memory:", e);
    }

    return output;
  },
};

/* ------------------------------------------------------------------ */
/*  Tool: lookup_clinical_evidence                                     */
/* ------------------------------------------------------------------ */

const lookupClinicalEvidenceTool: ToolDefinition = {
  name: "lookup_clinical_evidence",
  description:
    "Search PubMed medical literature and clinical guidelines for evidence " +
    "relevant to the patient's health anomaly flags. Returns peer-reviewed " +
    "studies, clinical guidelines (AHA, CDC, WHO), and drug interaction data " +
    "from the FDA. Use this AFTER analyze_anomaly and BEFORE triage_patient " +
    "to ground your triage decisions in clinical evidence.",
  parameters: {
    type: "object",
    properties: {
      flags: {
        type: "array",
        items: { type: "string" },
        description:
          "Anomaly flags from the health alert (e.g. ['RHR_SPIKE', 'SLEEP_DROP'])",
      },
      metrics: {
        type: "object",
        description: "Current health metrics from the wearable",
        properties: {
          sleep_hours: { type: "number" },
          resting_hr_bpm: { type: "number" },
          steps: { type: "number" },
          hrv_ms: { type: "number" },
        },
      },
      medications: {
        type: "array",
        items: { type: "string" },
        description:
          "Optional list of patient medications to check for drug interactions via FDA data",
      },
    },
    required: ["flags"],
  },

  async execute(args, ctx) {
    const flags = (args.flags as string[]) || [];
    const metrics = (args.metrics as Record<string, unknown>) || {};
    const medications = (args.medications as string[]) || [];

    addStep(ctx.traceId, {
      actor: "clinical_evidence_agent",
      event: "EVIDENCE_LOOKUP_START",
      ok: true,
      data: { flags, medicationCount: medications.length },
    });

    const evidence = await lookupClinicalEvidence({ flags, metrics, medications });

    addStep(ctx.traceId, {
      actor: "clinical_evidence_agent",
      event: "EVIDENCE_FOUND",
      ok: true,
      data: {
        studyCount: evidence.studies.length,
        guidelineCount: evidence.guidelines.length,
        drugInteractionCount: evidence.drugInteractions.length,
      },
    });

    return {
      error: false,
      studies: evidence.studies.map((s) => ({
        title: s.title,
        authors: s.authors,
        pmid: s.pmid,
        url: s.url,
        journal: s.journal,
        year: s.year,
      })),
      guidelines: evidence.guidelines.map((g) => ({
        condition: g.condition,
        recommendation: g.recommendation,
        source: g.source,
      })),
      drug_interactions: evidence.drugInteractions,
      patient_summary: evidence.patientFriendlySummary,
    };
  },
};

/* ------------------------------------------------------------------ */
/*  Export all tools                                                    */
/* ------------------------------------------------------------------ */

export const ALL_TOOLS: ToolDefinition[] = [
  analyzeAnomaly,
  lookupClinicalEvidenceTool,
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
