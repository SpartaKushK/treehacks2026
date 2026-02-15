/**
 * Healthcare MCP Server — In-process MCP server for the Claude Agent SDK
 *
 * Wraps the 4 existing healthcare tool execute functions as MCP tools
 * using the SDK's `tool()` and `createSdkMcpServer()` helpers.
 */

import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { addStep } from "../trace";
import { runSchedulerAgent } from "../agents/SchedulerAgent";
import { runHealthAgent } from "../agents/HealthAgent";

/* ------------------------------------------------------------------ */
/*  Active Context — module-scoped, set before each query() call       */
/* ------------------------------------------------------------------ */

interface ActiveContext {
  traceId: string;
  provider: string;
  triggerData?: Record<string, unknown>;
}

let activeContext: ActiveContext | null = null;

export function setActiveContext(ctx: ActiveContext | null) {
  activeContext = ctx;
}

export function getActiveContext() {
  return activeContext;
}

/* ------------------------------------------------------------------ */
/*  Tool: analyze_anomaly                                              */
/* ------------------------------------------------------------------ */

const analyzeAnomalyTool = tool(
  "analyze_anomaly",
  "Analyze a health anomaly alert from a patient's wearable data. Evaluates severity, determines urgency, and decides whether the patient should contact a clinic. Returns a structured decision.",
  {
    user_handle: z.string().describe("The patient's handle (e.g. 'pari')"),
    date: z.string().describe("ISO date of the anomaly (e.g. '2026-02-14')"),
    baseline_window_days: z
      .number()
      .describe("Number of days used for the baseline window"),
    metrics: z
      .object({
        sleep_hours: z.number().optional(),
        resting_hr_bpm: z.number().optional(),
        steps: z.number().optional(),
        hrv_ms: z.number().optional(),
      })
      .describe("Current readings from the wearable"),
    baseline: z
      .object({
        sleep_mean: z.number().optional(),
        sleep_std: z.number().optional(),
        rhr_mean: z.number().optional(),
        rhr_std: z.number().optional(),
        steps_mean: z.number().optional(),
        steps_std: z.number().optional(),
      })
      .describe("Baseline statistics for comparison"),
    flags: z
      .array(z.string())
      .describe(
        "List of anomaly flags (e.g. 'low_sleep', 'high_resting_hr')"
      ),
    anomaly_score: z
      .number()
      .describe("Anomaly score from 0-100 (higher = more anomalous)"),
    freeform_context: z
      .string()
      .optional()
      .describe("Optional freeform context about the anomaly"),
  },
  async (args) => {
    const ctx = getActiveContext();
    const traceId = ctx?.traceId ?? "";
    const provider = (ctx?.provider ?? "claude") as "openai" | "claude";

    addStep(traceId, {
      actor: "secretary",
      event: "DELEGATE_TO_HEALTH_AGENT",
      ok: true,
      data: { handle: args.user_handle, request_type: "anomaly" },
    });

    try {
      const result = await runHealthAgent(
        {
          user_handle: args.user_handle,
          request_type: "anomaly",
          data: args as unknown as Record<string, unknown>,
        },
        { traceId, provider, triggerData: ctx?.triggerData },
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              result.error
                ? { error: true, message: result.finalDecision }
                : { error: false, finalDecision: result.finalDecision, message: result.finalDecision },
            ),
          },
        ],
      };
    } catch (e) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ error: true, message: `Health agent error: ${e instanceof Error ? e.message : String(e)}` }),
          },
        ],
      };
    }
  }
);

/* ------------------------------------------------------------------ */
/*  Tool: triage_patient                                               */
/* ------------------------------------------------------------------ */

const triagePatientTool = tool(
  "triage_patient",
  "Evaluate and score the severity/urgency of a patient's health issues. Performs intake questioning, assesses urgency based on anomaly data and context, and determines whether the patient needs to be seen. Does NOT handle scheduling — use schedule_appointment separately after this if the triage indicates the patient should be seen.",
  {
    patient_handle: z.string().describe("The patient's handle"),
    anomaly: z
      .record(z.unknown())
      .describe(
        "The original anomaly alert data (pass through from analyze_anomaly input)"
      ),
    urgency: z
      .enum(["routine", "soon", "urgent"])
      .describe("Urgency level determined by the anomaly analysis"),
    message: z
      .string()
      .describe(
        "Message to the clinic describing why the patient needs to be seen"
      ),
    patient_answers: z
      .record(z.unknown())
      .optional()
      .describe("Optional pre-filled intake answers (key-value pairs)"),
  },
  async (args) => {
    const ctx = getActiveContext();
    const traceId = ctx?.traceId ?? "";
    const provider = (ctx?.provider ?? "claude") as "openai" | "claude";

    addStep(traceId, {
      actor: "secretary",
      event: "DELEGATE_TO_HEALTH_AGENT",
      ok: true,
      data: { handle: args.patient_handle, request_type: "triage" },
    });

    try {
      const result = await runHealthAgent(
        {
          user_handle: args.patient_handle,
          request_type: "triage",
          data: args as unknown as Record<string, unknown>,
        },
        { traceId, provider, triggerData: ctx?.triggerData },
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              result.error
                ? { error: true, message: result.finalDecision }
                : { error: false, finalDecision: result.finalDecision, message: result.finalDecision },
            ),
          },
        ],
      };
    } catch (e) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ error: true, message: `Health agent error: ${e instanceof Error ? e.message : String(e)}` }),
          },
        ],
      };
    }
  }
);

/* ------------------------------------------------------------------ */
/*  Tool: get_health_summary                                           */
/* ------------------------------------------------------------------ */

const getHealthSummaryTool = tool(
  "get_health_summary",
  "Retrieve a 30-day health summary for a patient. Includes sleep, activity, medication adherence, and symptom trends. Useful for getting context before making triage decisions.",
  {
    patient_handle: z
      .string()
      .describe("The patient's handle (e.g. 'pari')"),
  },
  async (args) => {
    const ctx = getActiveContext();
    const traceId = ctx?.traceId ?? "";
    const provider = (ctx?.provider ?? "claude") as "openai" | "claude";

    addStep(traceId, {
      actor: "secretary",
      event: "DELEGATE_TO_HEALTH_AGENT",
      ok: true,
      data: { handle: args.patient_handle, request_type: "summary" },
    });

    try {
      const result = await runHealthAgent(
        {
          user_handle: args.patient_handle,
          request_type: "summary",
        },
        { traceId, provider, triggerData: ctx?.triggerData },
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              result.error
                ? { error: true, message: result.finalDecision }
                : { error: false, finalDecision: result.finalDecision, message: result.finalDecision },
            ),
          },
        ],
      };
    } catch (e) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ error: true, message: `Health agent error: ${e instanceof Error ? e.message : String(e)}` }),
          },
        ],
      };
    }
  }
);

/* ------------------------------------------------------------------ */
/*  Tool: schedule_appointment                                         */
/* ------------------------------------------------------------------ */

const scheduleAppointmentTool = tool(
  "schedule_appointment",
  "The calendar scheduling sub-agent. Checks the user's real Google Calendar (if connected) and local calendar for conflicts, finds genuinely free time slots, books the best available slot, and creates the event on Google Calendar. Use this whenever an appointment needs to be scheduled — after triage scoring indicates the patient should be seen, or for any general scheduling needs.",
  {
    user_handle: z
      .string()
      .describe("Handle of the user whose calendar to check and book on"),
    title: z
      .string()
      .describe(
        "Title/reason for the appointment (e.g. 'Medical Appointment — urgent triage')"
      ),
    urgency: z
      .enum(["routine", "soon", "urgent"])
      .describe(
        "Urgency level — affects how soon the slot is searched (urgent=today, soon=1-2 days, routine=3+ days)"
      ),
    duration_mins: z
      .number()
      .optional()
      .describe("Duration in minutes (default 30)"),
    method: z
      .enum(["in_person", "telehealth"])
      .optional()
      .describe(
        "Appointment method (default: in_person for urgent, telehealth for routine)"
      ),
    description: z
      .string()
      .optional()
      .describe("Optional description or notes for the calendar event"),
  },
  async (args) => {
    const ctx = getActiveContext();
    const traceId = ctx?.traceId ?? "";
    const provider = (ctx?.provider ?? "claude") as "openai" | "claude";

    const handle = args.user_handle;
    const urgency = args.urgency || "routine";
    const durationMins = args.duration_mins || 30;
    const method =
      args.method || (urgency === "urgent" ? "in_person" : "telehealth");

    addStep(traceId, {
      actor: "secretary",
      event: "DELEGATE_TO_SCHEDULER_AGENT",
      ok: true,
      data: { handle, urgency, durationMins, method },
    });

    try {
      // Delegate to the SchedulerAgent sub-agent
      const schedulerResult = await runSchedulerAgent(
        {
          user_handle: handle,
          title: args.title,
          urgency: urgency as "routine" | "soon" | "urgent",
          duration_mins: durationMins,
          method: method as "in_person" | "telehealth",
          description: args.description,
        },
        { traceId, provider },
      );

      if (schedulerResult.error) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: true,
                message: schedulerResult.finalDecision,
              }),
            },
          ],
        };
      }

      // Extract booking info from the scheduler's tool call log
      const bookingCall = schedulerResult.toolCallLog.find(
        (tc) => tc.tool === "book_appointment" && tc.result.scheduled,
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              error: false,
              scheduled: !!bookingCall,
              finalDecision: schedulerResult.finalDecision,
              booking: bookingCall?.result?.booking || null,
              google_calendar: bookingCall?.result?.google_calendar || null,
              scheduler_turns: schedulerResult.turns,
              scheduler_tool_calls: schedulerResult.toolCallLog.map((tc) => tc.tool),
              message: schedulerResult.finalDecision,
            }),
          },
        ],
      };
    } catch (e) {
      console.error("[schedule_appointment MCP] SchedulerAgent delegation error:", e);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              error: true,
              message: `Scheduler agent error: ${e instanceof Error ? e.message : String(e)}`,
            }),
          },
        ],
      };
    }
  }
);

/* ------------------------------------------------------------------ */
/*  Tool: lookup_clinical_evidence                                     */
/* ------------------------------------------------------------------ */

const lookupClinicalEvidenceTool = tool(
  "lookup_clinical_evidence",
  "Search PubMed medical literature and clinical guidelines (AHA, CDC, WHO, ESC) for peer-reviewed evidence relevant to the patient's anomaly flags. Also checks the FDA adverse event database for drug interactions if medications are provided. Use this AFTER analyze_anomaly to ground triage decisions in real clinical evidence.",
  {
    flags: z
      .array(z.string())
      .describe(
        "Anomaly flags from the health alert (e.g. ['RHR_SPIKE', 'SLEEP_DROP'])"
      ),
    metrics: z
      .object({
        sleep_hours: z.number().optional(),
        resting_hr_bpm: z.number().optional(),
        steps: z.number().optional(),
        hrv_ms: z.number().optional(),
      })
      .optional()
      .describe("Current health metrics from the wearable"),
    medications: z
      .array(z.string())
      .optional()
      .describe(
        "Optional list of patient medications to check for drug interactions via FDA data"
      ),
  },
  async (args) => {
    const ctx = getActiveContext();
    const traceId = ctx?.traceId ?? "";
    const provider = (ctx?.provider ?? "claude") as "openai" | "claude";
    const handle = (ctx?.triggerData?.user_handle as string) || "unknown";

    addStep(traceId, {
      actor: "secretary",
      event: "DELEGATE_TO_HEALTH_AGENT",
      ok: true,
      data: { handle, request_type: "evidence" },
    });

    try {
      const result = await runHealthAgent(
        {
          user_handle: handle,
          request_type: "evidence",
          data: args as unknown as Record<string, unknown>,
        },
        { traceId, provider, triggerData: ctx?.triggerData },
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              result.error
                ? { error: true, message: result.finalDecision }
                : { error: false, finalDecision: result.finalDecision, message: result.finalDecision },
            ),
          },
        ],
      };
    } catch (e) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ error: true, message: `Health agent error: ${e instanceof Error ? e.message : String(e)}` }),
          },
        ],
      };
    }
  }
);

/* ------------------------------------------------------------------ */
/*  Export the MCP server                                              */
/* ------------------------------------------------------------------ */

export const healthcareServer = createSdkMcpServer({
  name: "healthcare",
  version: "1.0.0",
  tools: [
    analyzeAnomalyTool,
    lookupClinicalEvidenceTool,
    triagePatientTool,
    getHealthSummaryTool,
    scheduleAppointmentTool,
  ],
});
