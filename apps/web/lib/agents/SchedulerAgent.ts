/**
 * Scheduler Agent — Sub-agent for calendar management and appointment scheduling
 *
 * Responsible for:
 * - Finding available time slots
 * - Booking appointments on Google Calendar
 * - Checking calendar conflicts
 * - Managing local calendar events
 *
 * Memory scope: "scheduler" per user
 */

import { Agent } from "./base/Agent";
import type { AgentConfig, AgentContext, AgentResult } from "./base/types";
import {
  findAvailableSlots,
  bookCalendarEvent,
  getBusySlots,
} from "../google-calendar";
import { prisma } from "../store";
import { addStep } from "../trace";
import { extractUserHandle } from "./base/utils";

export class SchedulerAgent extends Agent {
  constructor(config?: Partial<AgentConfig>) {
    const fullConfig: AgentConfig = {
      agentType: "scheduler",
      systemPrompt: buildSchedulerAgentPrompt(),
      provider: config?.provider || "claude",
      ...config,
    };

    // Define tools for potential future LLM loop
    const tools = [
      // Future: when we add LLM loop to scheduler, these will be used
      // For now, we'll use direct method calls
    ];

    super(fullConfig, tools);
  }

  /**
   * Main entry point — delegates to scheduleAppointment by default.
   */
  async run(
    input: Record<string, unknown>,
    context: AgentContext,
  ): Promise<AgentResult> {
    return this.scheduleAppointment(input, context);
  }

  /**
   * Schedule an appointment for a user.
   * This is the primary method for appointment booking.
   *
   * Full workflow:
   * 1. Resolve user
   * 2. Determine search window based on urgency
   * 3. Find available slots from Google Calendar + local events
   * 4. Book the best available slot
   * 5. Save to memory
   */
  async scheduleAppointment(
    input: Record<string, unknown>,
    context: AgentContext,
  ): Promise<AgentResult> {
    const handle = extractUserHandle(input);
    const urgency = (input.urgency as string) || "routine";
    const durationMins = (input.duration_mins as number) || 30;
    const method =
      (input.method as string) ||
      (urgency === "urgent" ? "in_person" : "telehealth");
    const title = (input.title as string) || "Medical Appointment";

    addStep(context.traceId, {
      actor: "scheduler_agent",
      event: "SCHEDULE_START",
      ok: true,
      data: { userHandle: handle, urgency, durationMins, method },
    });

    // 1. Resolve user
    const human = await prisma.human.findUnique({
      where: { handle },
      select: { id: true },
    });

    if (!human) {
      const errorResult = {
        error: true,
        message: `User '${handle}' not found`,
      };

      await this.saveToMemory(
        handle,
        `Schedule appointment: ${title} (${urgency})`,
        `Error: ${errorResult.message}`,
        { traceId: context.traceId },
      );

      return {
        ok: false,
        data: errorResult,
        traceId: context.traceId,
      };
    }

    // 2. Determine search window based on urgency
    const now = new Date();
    const dayOffset = urgency === "urgent" ? 0 : urgency === "soon" ? 1 : 3;
    const windowStart = new Date(now);
    windowStart.setDate(windowStart.getDate() + dayOffset);
    const windowEnd = new Date(now);
    windowEnd.setDate(windowEnd.getDate() + dayOffset + 7);

    addStep(context.traceId, {
      actor: "scheduler_agent",
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
      5,
    );

    // Also get current busy events for context
    const busyEvents = await getBusySlots(
      human.id,
      windowStart.toISOString(),
      windowEnd.toISOString(),
    );

    addStep(context.traceId, {
      actor: "scheduler_agent",
      event: "AVAILABILITY_FOUND",
      ok: true,
      data: {
        freeSlots: availableSlots.length,
        busyEvents: busyEvents.length,
        slots: availableSlots,
      },
    });

    if (availableSlots.length === 0) {
      const noSlotsResult = {
        error: false,
        scheduled: false,
        message: `No available ${durationMins}-minute slots found in the next ${dayOffset + 7} days for '${handle}'. The user has ${busyEvents.length} events in that window.`,
        busy_event_count: busyEvents.length,
      };

      await this.saveToMemory(
        handle,
        `Schedule appointment: ${title} (${urgency}, ${durationMins}min)`,
        noSlotsResult.message,
        {
          traceId: context.traceId,
          provider: context.provider,
          parentAgent: context.parentAgent,
        },
      );

      return {
        ok: true, // Not an error, just no availability
        data: noSlotsResult,
        traceId: context.traceId,
      };
    }

    // 4. Book the best (first available) slot
    const chosenSlot = availableSlots[0];

    const bookingResult = await bookCalendarEvent(human.id, {
      summary: title,
      start: chosenSlot.start,
      end: chosenSlot.end,
      description:
        (input.description as string) ||
        `${title}. Urgency: ${urgency}. Method: ${method}.`,
    });

    addStep(context.traceId, {
      actor: "scheduler_agent",
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
        title,
      },
      google_calendar: bookingResult.googleEventId
        ? { synced: true, event_id: bookingResult.googleEventId }
        : { synced: false, reason: "Google Calendar not connected — saved locally" },
      alternative_slots: availableSlots.slice(1, 4),
      message: `Appointment booked: ${title} on ${new Date(chosenSlot.start).toLocaleDateString()} at ${new Date(chosenSlot.start).toLocaleTimeString()} (${method}).`,
    };

    // Save to scheduler agent's memory
    await this.saveToMemory(
      handle,
      `Schedule appointment: ${title} (${urgency}, ${durationMins}min)`,
      output.message,
      {
        traceId: context.traceId,
        provider: context.provider,
        parentAgent: context.parentAgent,
        booking: output.booking,
        googleSynced: !!bookingResult.googleEventId,
      },
    );

    // Also save as tool interaction for detailed tracking
    await this.saveToolToMemory(
      handle,
      "schedule_appointment",
      input,
      output,
    );

    return {
      ok: true,
      data: output,
      traceId: context.traceId,
    };
  }

  /**
   * Query available time slots for a user without booking.
   * Useful for showing options to the user before scheduling.
   */
  async queryAvailability(
    input: Record<string, unknown>,
    context: AgentContext,
  ): Promise<AgentResult> {
    const handle = extractUserHandle(input);
    const durationMins = (input.duration_mins as number) || 30;
    const windowStart =
      (input.window_start as string) || new Date().toISOString();
    const windowEnd =
      (input.window_end as string) ||
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    addStep(context.traceId, {
      actor: "scheduler_agent",
      event: "AVAILABILITY_QUERY",
      ok: true,
      data: { userHandle: handle, durationMins, windowStart, windowEnd },
    });

    // Resolve user
    const human = await prisma.human.findUnique({
      where: { handle },
      select: { id: true },
    });

    if (!human) {
      return {
        ok: false,
        data: {
          error: true,
          message: `User '${handle}' not found`,
        },
        traceId: context.traceId,
      };
    }

    // Find available slots
    const availableSlots = await findAvailableSlots(
      human.id,
      windowStart,
      windowEnd,
      durationMins,
      10, // Return up to 10 slots for query
    );

    // Get busy events for context
    const busyEvents = await getBusySlots(human.id, windowStart, windowEnd);

    const output = {
      error: false,
      available_slots: availableSlots,
      busy_events_count: busyEvents.length,
      message: `Found ${availableSlots.length} available ${durationMins}-minute slots.`,
    };

    addStep(context.traceId, {
      actor: "scheduler_agent",
      event: "AVAILABILITY_RESULT",
      ok: true,
      data: output,
    });

    return {
      ok: true,
      data: output,
      traceId: context.traceId,
    };
  }
}

/* ------------------------------------------------------------------ */
/*  Helper Functions                                                   */
/* ------------------------------------------------------------------ */

function buildSchedulerAgentPrompt(): string {
  return `You are a Scheduler Agent specialized in calendar management and appointment booking.

Your responsibilities:
- Find available time slots in users' calendars
- Book appointments on Google Calendar (if connected) and locally
- Check for scheduling conflicts
- Respect urgency levels when scheduling:
  * urgent: today or next available slot
  * soon: within 1-2 days
  * routine: within 3-7 days
- Only suggest slots during business hours (9am-6pm, weekdays)

When scheduling:
- Always check both Google Calendar and local events for conflicts
- Book the earliest available slot that matches the urgency level
- Provide alternative slots when available
- Confirm whether the appointment was synced to Google Calendar

You have access to real calendar data and can create actual calendar events.`;
}
