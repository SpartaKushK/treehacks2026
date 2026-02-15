/**
 * Secretary Agent — Tool Definitions
 *
 * Each tool wraps an existing capability handler so the secretary LLM
 * can invoke it via function-calling. The secretary never does domain
 * logic itself — it delegates everything here.
 */

import { addStep } from "../trace";
import { runSchedulerAgent, type SchedulerInput } from "../agents/SchedulerAgent";
import { runHealthAgent, type HealthAgentInput } from "../agents/HealthAgent";
import { DoctorAlertSchema } from "../agentRegistry";
import { prisma } from "../store";
import { findAvailableSlots } from "../google-calendar";
import { bookCalendarEvent } from "../google-calendar";

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
    const handle = (args.user_handle as string) || (ctx.triggerData?.user_handle as string) || "unknown";

    addStep(ctx.traceId, {
      actor: "secretary",
      event: "DELEGATE_TO_HEALTH_AGENT",
      ok: true,
      data: { handle, request_type: "anomaly" },
    });

    try {
      const result = await runHealthAgent(
        {
          user_handle: handle,
          request_type: "anomaly",
          data: args,
        },
        { traceId: ctx.traceId, provider: ctx.provider, triggerData: ctx.triggerData },
      );

      if (result.error) {
        return { error: true, message: result.finalDecision };
      }

      return {
        error: false,
        finalDecision: result.finalDecision,
        health_agent_turns: result.turns,
        health_agent_tool_calls: result.toolCallLog.map((tc) => tc.tool),
        message: result.finalDecision,
      };
    } catch (e) {
      console.error("[analyze_anomaly] HealthAgent delegation error:", e);
      return {
        error: true,
        message: `Health agent error: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};

/* ------------------------------------------------------------------ */
/*  Tool: notify_doctor_agent                                          */
/* ------------------------------------------------------------------ */

const notifyDoctorAgent: ToolDefinition = {
  name: "notify_doctor_agent",
  description:
    "Send a health alert to the external Doctor Agent (Python service) via its single /alert endpoint. " +
    "Use when you want the doctor agent to run its own triage + scheduling pipeline. " +
    "The patient_agent_url defaults to the local patient-agent stub (/api/patient/agent) if not provided.",
  parameters: {
    type: "object",
    properties: {
      patient_id: { type: "string", description: "Patient identifier (e.g. handle)" },
      patient_name: { type: "string", description: "Patient display name" },
      patient_email: { type: "string", description: "Patient email for scheduling confirmation" },
      patient_phone: { type: "string", description: "Optional phone number" },
      alert_type: { type: "string", description: "Doctor agent AlertType string" },
      metric_value: { type: "number", description: "Numeric metric value (e.g. 142)" },
      metric_unit: { type: "string", description: "Unit (e.g. bpm)" },
      threshold_value: { type: "number", description: "Baseline/threshold" },
      description: { type: "string", description: "Human-readable alert description" },
      patient_agent_url: { type: "string", description: "Callback URL for slot proposals" },
      preferred_days: { type: "array", items: { type: "string" } },
      preferred_time_of_day: {
        type: "string",
        enum: ["morning", "afternoon", "evening"],
      },
    },
    required: ["patient_id", "patient_name", "patient_email", "alert_type", "description"],
  },

  async execute(args, ctx) {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const doctorProxy = `${baseUrl}/api/doctor/alert`;
    const fallbackPatientUrl =
      process.env.PATIENT_AGENT_URL || `${baseUrl}/api/patient/agent`;

    const td = ctx.triggerData || {};
    const payload = {
      patient_id: (args.patient_id as string) || (td.user_handle as string) || "unknown",
      patient_name:
        (args.patient_name as string) || (td.patient_name as string) || (td.user_handle as string) || "Patient",
      patient_email:
        (args.patient_email as string) ||
        (td.patient_email as string) ||
        `${(td.user_handle as string) || "patient"}@example.com`,
      patient_phone: (args.patient_phone as string) || (td.patient_phone as string) || undefined,
      alert_type: (args.alert_type as string) || (td.alert_type as string) || "unknown",
      metric_value: (args.metric_value as number) ?? (td.metric_value as number),
      metric_unit: (args.metric_unit as string) || (td.metric_unit as string),
      threshold_value:
        (args.threshold_value as number) ?? (td.threshold_value as number) ?? (td.threshold as number),
      description:
        (args.description as string) ||
        (td.description as string) ||
        "Health alert forwarded from Secretary Agent.",
      patient_agent_url:
        (args.patient_agent_url as string) ||
        (td.patient_agent_url as string) ||
        fallbackPatientUrl,
      preferred_days:
        (args.preferred_days as string[]) || (td.preferred_days as string[]) || undefined,
      preferred_time_of_day:
        (args.preferred_time_of_day as string) || (td.preferred_time_of_day as string) || undefined,
    };

    const validation = DoctorAlertSchema.safeParse(payload);
    if (!validation.success) {
      return {
        error: true,
        message: `Invalid doctor alert payload: ${validation.error.message}`,
      };
    }

    addStep(ctx.traceId, {
      actor: "secretary",
      event: "FORWARD_TO_DOCTOR_AGENT",
      ok: true,
      data: { endpoint: doctorProxy, patient_id: payload.patient_id },
    });

    console.log("[notify_doctor_agent] sending alert to proxy", doctorProxy, "patient_id=", payload.patient_id);

    try {
      const res = await fetch(doctorProxy, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      let json: Record<string, unknown> = {};
      try {
        json = await res.json();
      } catch {
        // ignore parse errors
      }

      return {
        error: !res.ok,
        status: res.status,
        response: json,
        message: res.ok
          ? "Doctor agent accepted alert."
          : `Doctor agent returned ${res.status}`,
      };
    } catch (e) {
      console.error("[notify_doctor_agent] error:", e);
      return {
        error: true,
        message: `Failed to reach doctor agent: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};

/* ------------------------------------------------------------------ */
/*  Tool: send_health_trigger (Secretary / protocol path)              */
/* ------------------------------------------------------------------ */

const sendHealthTrigger: ToolDefinition = {
  name: "send_health_trigger",
  description:
    "Send a health request to the Secretary Agent via the trigger API. The Secretary will orchestrate the workflow (e.g. analyze anomaly, contact doctor agent, triage, schedule). Use this when the user wants to send an alert to the doctor, notify the care team, or have a health issue handled by the full pipeline — do NOT use notify_doctor_agent directly; use this so the Secretary runs the correct protocol.",
  parameters: {
    type: "object",
    properties: {
      user_handle: { type: "string", description: "Patient/user handle (e.g. pari)" },
      trigger_type: {
        type: "string",
        enum: ["health_anomaly", "health_summary", "schedule", "custom"],
        description: "Type of trigger; use health_anomaly for alerts, custom for freeform",
      },
      description: { type: "string", description: "Human-readable description of what the user asked for" },
      anomaly_score: { type: "number", description: "Optional 0-100 anomaly score if known" },
      flags: {
        type: "array",
        items: { type: "string" },
        description: "Optional anomaly flags (e.g. SLEEP_DROP, RHR_SPIKE)",
      },
    },
    required: ["user_handle", "description"],
  },

  async execute(args, ctx) {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const triggerUrl = `${baseUrl}/api/trigger`;
    const userHandle = (args.user_handle as string) || (ctx.triggerData?.user_handle as string) || "unknown";
    const triggerType = (args.trigger_type as string) || "custom";
    const description = (args.description as string) || "User requested health workflow";

    const data: Record<string, unknown> = {
      user_handle: userHandle,
      ...(args.anomaly_score != null && { anomaly_score: args.anomaly_score }),
      ...(args.flags && Array.isArray(args.flags) && { flags: args.flags }),
    };

    addStep(ctx.traceId, {
      actor: "chat",
      event: "SEND_HEALTH_TRIGGER",
      ok: true,
      data: { triggerUrl, trigger_type: triggerType, user_handle: userHandle },
    });

    console.log("[send_health_trigger] calling Secretary at", triggerUrl, "trigger_type=", triggerType);

    try {
      const res = await fetch(triggerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trigger_type: triggerType,
          data,
          description,
        }),
        signal: AbortSignal.timeout(60_000),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          error: true,
          message: (json as { error?: string }).error || `Trigger returned ${res.status}`,
          status: res.status,
        };
      }
      return {
        error: false,
        traceId: (json as { traceId?: string }).traceId,
        finalDecision: (json as { finalDecision?: string }).finalDecision,
        toolCallLog: (json as { toolCallLog?: unknown[] }).toolCallLog,
        provider: (json as { provider?: string }).provider,
      };
    } catch (e) {
      console.error("[send_health_trigger] error:", e);
      return {
        error: true,
        message: e instanceof Error ? e.message : String(e),
      };
    }
  },
};

/* ------------------------------------------------------------------ */
/*  Tool: check_doctor_availability (read-only, no booking)            */
/* ------------------------------------------------------------------ */

const checkDoctorAvailability: ToolDefinition = {
  name: "check_doctor_availability",
  description:
    "Return free time slots on the doctor's calendar from the Doctor Agent (real calendar). " +
    "Use when the user asks for doctor availability. Pass date (YYYY-MM-DD) when they ask for a specific day (e.g. Feb 20).",
  parameters: {
    type: "object",
    properties: {
      doctor_handle: {
        type: "string",
        description: "Handle of the doctor (e.g. 'dr_smith')",
      },
      window_hours: {
        type: "number",
        description: "How many hours ahead to search (default 240 = 10 days)",
      },
      date: {
        type: "string",
        description: "Optional: YYYY-MM-DD to get slots only on this day (e.g. '2026-02-20' for Feb 20)",
      },
      duration_mins: {
        type: "number",
        description: "Meeting duration in minutes (default 30)",
      },
      max_slots: {
        type: "number",
        description: "Maximum number of slots to return (default 10)",
      },
    },
    required: ["doctor_handle"],
  },

  async execute(args, ctx) {
    const handle = (args.doctor_handle as string) || "dr_smith";
    const windowHours = (args.window_hours as number) ?? 240; // 10 days default
    const maxSlots = (args.max_slots as number) ?? 10;
    const dateOnly = (args.date as string) || undefined;

    const doctorAgentUrl =
      (process.env.DOCTOR_AGENT_URL?.replace(/\/$/, "") || "http://localhost:8000") + "/agent";

    try {
      const res = await fetch(doctorAgentUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "get_availability",
          get_availability: {
            hours_ahead: windowHours,
            max_slots: maxSlots,
            ...(dateOnly && { date: dateOnly }),
          },
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        addStep(ctx.traceId, {
          actor: "secretary",
          event: "DOCTOR_AVAILABILITY_CHECK",
          ok: false,
          data: { handle, error: `${res.status}: ${text}` },
        });
        return {
          error: true,
          doctor_handle: handle,
          message: `Doctor Agent returned ${res.status}: ${text}`,
        };
      }

      const data = (await res.json()) as { slots: Array<{ start: string; end: string; label?: string }> };
      const slots = data.slots ?? [];

      addStep(ctx.traceId, {
        actor: "secretary",
        event: "DOCTOR_AVAILABILITY_CHECK",
        ok: true,
        data: { handle, window_hours: windowHours, slots: slots.length, source: "doctor_agent" },
      });

      return {
        error: false,
        doctor_handle: handle,
        window_hours: windowHours,
        ...(dateOnly && { date: dateOnly }),
        available_slots: slots,
        count: slots.length,
        message:
          slots.length > 0
            ? `Found ${slots.length} available slots for ${handle}${dateOnly ? ` on ${dateOnly}` : ""} (Doctor Agent calendar).`
            : `No available slots for ${handle}${dateOnly ? ` on ${dateOnly}` : ` in next ${windowHours} hours`} (Doctor Agent calendar).`,
      };
    } catch (e) {
      addStep(ctx.traceId, {
        actor: "secretary",
        event: "DOCTOR_AVAILABILITY_CHECK",
        ok: false,
        data: { handle, error: String(e) },
      });
      return {
        error: true,
        doctor_handle: handle,
        message: `Failed to reach Doctor Agent: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
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
    const handle = (args.patient_handle as string) || (ctx.triggerData?.user_handle as string) || "unknown";

    addStep(ctx.traceId, {
      actor: "secretary",
      event: "DELEGATE_TO_HEALTH_AGENT",
      ok: true,
      data: { handle, request_type: "triage" },
    });

    try {
      const result = await runHealthAgent(
        {
          user_handle: handle,
          request_type: "triage",
          data: args,
        },
        { traceId: ctx.traceId, provider: ctx.provider, triggerData: ctx.triggerData },
      );

      if (result.error) {
        return { error: true, message: result.finalDecision };
      }

      return {
        error: false,
        finalDecision: result.finalDecision,
        health_agent_turns: result.turns,
        health_agent_tool_calls: result.toolCallLog.map((tc) => tc.tool),
        message: result.finalDecision,
      };
    } catch (e) {
      console.error("[triage_patient] HealthAgent delegation error:", e);
      return {
        error: true,
        message: `Health agent error: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
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
    const handle = (args.patient_handle as string) || (ctx.triggerData?.user_handle as string) || "unknown";

    addStep(ctx.traceId, {
      actor: "secretary",
      event: "DELEGATE_TO_HEALTH_AGENT",
      ok: true,
      data: { handle, request_type: "summary" },
    });

    try {
      const result = await runHealthAgent(
        {
          user_handle: handle,
          request_type: "summary",
        },
        { traceId: ctx.traceId, provider: ctx.provider, triggerData: ctx.triggerData },
      );

      if (result.error) {
        return { error: true, message: result.finalDecision };
      }

      return {
        error: false,
        finalDecision: result.finalDecision,
        health_agent_turns: result.turns,
        health_agent_tool_calls: result.toolCallLog.map((tc) => tc.tool),
        message: result.finalDecision,
      };
    } catch (e) {
      console.error("[get_health_summary] HealthAgent delegation error:", e);
      return {
        error: true,
        message: `Health agent error: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
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
    "This tool handles the entire scheduling workflow end-to-end. " +
    "Optionally pass doctor_handle to also add the booking to the doctor's calendar and send a callback.",
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
      doctor_handle: {
        type: "string",
        description:
          "Optional: doctor handle to mirror the booking on the doctor's calendar and notify the doctor agent",
      },
      preferred_date: {
        type: "string",
        description:
          "Optional: preferred date in YYYY-MM-DD when the user asked for a specific day (e.g. 'Feb 20' -> '2026-02-20')",
      },
      preferred_time: {
        type: "string",
        description:
          "Optional: preferred time when the user asked for a specific time (e.g. '9am', '9:00 AM', '14:00'). Use 12h or 24h; will match Pacific slots.",
      },
      doctor_callback_url: {
        type: "string",
        description:
          "Optional: explicit callback URL for the doctor agent schedule/response endpoint. Defaults to DOCTOR_AGENT_URL + /schedule/response",
      },
    },
    required: ["user_handle", "title", "urgency"],
  },

  async execute(args, ctx) {
    const handle = (args.user_handle as string) || (ctx.triggerData?.user_handle as string) || "unknown";
    const urgency = (args.urgency as string) || "routine";
    const durationMins = (args.duration_mins as number) || 30;
    const method = (args.method as string) || (urgency === "urgent" ? "in_person" : "telehealth");
    const doctorHandle = (args.doctor_handle as string) || null;
    const doctorCallback =
      (args.doctor_callback_url as string) ||
      (process.env.DOCTOR_AGENT_URL
        ? `${process.env.DOCTOR_AGENT_URL.replace(/\/$/, "")}/schedule/response`
        : null);

    addStep(ctx.traceId, {
      actor: "secretary",
      event: "DELEGATE_TO_SCHEDULER_AGENT",
      ok: true,
      data: { handle, urgency, durationMins, method },
    });

    try {
      // Delegate to the SchedulerAgent sub-agent (pass doctor_handle so it uses Doctor Agent for slots/booking)
      const schedulerResult = await runSchedulerAgent(
        {
          user_handle: handle,
          title: (args.title as string) || "Medical Appointment",
          urgency: urgency as "routine" | "soon" | "urgent",
          duration_mins: durationMins,
          method: method as "in_person" | "telehealth",
          description: args.description as string | undefined,
          doctor_handle: doctorHandle ?? undefined,
          preferred_date: (args.preferred_date as string) || undefined,
          preferred_time: (args.preferred_time as string) || undefined,
        },
        {
          traceId: ctx.traceId,
          provider: ctx.provider,
        },
      );

      if (schedulerResult.error) {
        return { error: true, message: schedulerResult.finalDecision };
      }

      // Extract booking info from the scheduler's tool call log
      const bookingCall = schedulerResult.toolCallLog.find(
        (tc) => tc.tool === "book_appointment" && tc.result.scheduled,
      );

      // Mirror booking to doctor calendar if requested
      if (doctorHandle && bookingCall?.result?.booking) {
        const doc = await prisma.human.findUnique({
          where: { handle: doctorHandle },
          select: { id: true },
        });
        if (doc) {
          try {
            await bookCalendarEvent(doc.id, {
              summary: bookingCall.result.booking.title || args.title,
              start: bookingCall.result.booking.start,
              end: bookingCall.result.booking.end,
              description:
                bookingCall.result.booking.description ||
                args.description ||
                `Appointment mirrored for ${doctorHandle}`,
            });
            addStep(ctx.traceId, {
              actor: "secretary",
              event: "DOCTOR_CALENDAR_MIRROR",
              ok: true,
              data: { doctor_handle: doctorHandle },
            });
          } catch (e) {
            addStep(ctx.traceId, {
              actor: "secretary",
              event: "DOCTOR_CALENDAR_MIRROR",
              ok: false,
              data: { doctor_handle: doctorHandle, error: String(e) },
            });
          }
        }

        // Write to the Python Doctor Agent's calendar (chimorty@gmail.com / service account)
        const doctorAgentBase =
          process.env.DOCTOR_AGENT_URL?.replace(/\/$/, "") || "http://localhost:8000";
        const patientHuman = await prisma.human.findUnique({
          where: { handle },
          select: { displayName: true },
        });
        const patientName = patientHuman?.displayName ?? handle;
        const patientEmail = `${handle}@patients.local`;
        try {
          const bookingRes = await fetch(`${doctorAgentBase}/booking`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              start: bookingCall.result.booking.start,
              end: bookingCall.result.booking.end,
              patient_name: patientName,
              patient_email: patientEmail,
              title: bookingCall.result.booking.title || (args.title as string) || "Medical Appointment",
              description:
                bookingCall.result.booking.description ||
                (args.description as string) ||
                `Scheduled via Secretary (patient: ${handle})`,
            }),
          });
          if (bookingRes.ok) {
            const data = (await bookingRes.json()) as { calendar_event_id?: string };
            addStep(ctx.traceId, {
              actor: "secretary",
              event: "DOCTOR_AGENT_CALENDAR_BOOKED",
              ok: true,
              data: { doctor_handle: doctorHandle, calendar_event_id: data.calendar_event_id },
            });
          } else {
            const text = await bookingRes.text();
            addStep(ctx.traceId, {
              actor: "secretary",
              event: "DOCTOR_AGENT_CALENDAR_BOOKED",
              ok: false,
              data: { doctor_handle: doctorHandle, error: text },
            });
          }
        } catch (e) {
          addStep(ctx.traceId, {
            actor: "secretary",
            event: "DOCTOR_AGENT_CALENDAR_BOOKED",
            ok: false,
            data: { doctor_handle: doctorHandle, error: String(e) },
          });
        }

        // Send callback to doctor agent if endpoint is known (for compatibility with alert pipeline)
        if (doctorCallback) {
          const payload = {
            proposal_id: "external-booking",
            patient_id: args.user_handle,
            accepted: true,
            selected_slot: bookingCall.result.booking,
            counter_message: null,
          };
          try {
            await fetch(doctorCallback, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            addStep(ctx.traceId, {
              actor: "secretary",
              event: "DOCTOR_CALLBACK_SENT",
              ok: true,
              data: { doctor_handle: doctorHandle, callback: doctorCallback },
            });
          } catch (e) {
            addStep(ctx.traceId, {
              actor: "secretary",
              event: "DOCTOR_CALLBACK_SENT",
              ok: false,
              data: { doctor_handle: doctorHandle, callback: doctorCallback, error: String(e) },
            });
          }
        }
      }

      return {
        error: false,
        scheduled: !!bookingCall,
        finalDecision: schedulerResult.finalDecision,
        booking: bookingCall?.result?.booking || null,
        google_calendar: bookingCall?.result?.google_calendar || null,
        scheduler_turns: schedulerResult.turns,
        scheduler_tool_calls: schedulerResult.toolCallLog.map((tc) => tc.tool),
        message: schedulerResult.finalDecision,
      };
    } catch (e) {
      console.error("[schedule_appointment] SchedulerAgent delegation error:", e);
      return {
        error: true,
        message: `Scheduler agent error: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
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
    const handle = (ctx.triggerData?.user_handle as string) || "unknown";

    addStep(ctx.traceId, {
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
          data: args,
        },
        { traceId: ctx.traceId, provider: ctx.provider, triggerData: ctx.triggerData },
      );

      if (result.error) {
        return { error: true, message: result.finalDecision };
      }

      return {
        error: false,
        finalDecision: result.finalDecision,
        health_agent_turns: result.turns,
        health_agent_tool_calls: result.toolCallLog.map((tc) => tc.tool),
        message: result.finalDecision,
      };
    } catch (e) {
      console.error("[lookup_clinical_evidence] HealthAgent delegation error:", e);
      return {
        error: true,
        message: `Health agent error: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
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
  sendHealthTrigger,
  notifyDoctorAgent,
  checkDoctorAvailability,
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
