import { prisma } from "./store";
import { v4 as uuid } from "uuid";
import type { HealthSummaryOutput } from "@people/shared";
import { handleHealthAnomalyAlert } from "./capabilities/healthAnomalyAlert";
import { handleTriageIntakeAndSchedule } from "./capabilities/triageIntakeAndSchedule";

/**
 * Route a capability invocation to the correct handler.
 * traceId + provider are optional — used by the new anomaly/triage flow.
 */
export async function handleCapability(
  calleeHandle: string,
  capability: string,
  input: unknown,
  opts?: { traceId?: string; provider?: "openai" | "claude" }
): Promise<{ ok: boolean; data: unknown }> {
  switch (capability) {
    case "schedule_propose":
      return handleSchedulePropose(calleeHandle, input);
    case "schedule_counter":
      return handleScheduleCounter(calleeHandle, input);
    case "schedule_confirm":
      return handleScheduleConfirm(input);
    case "health_summary":
      return handleHealthSummary(calleeHandle);
    case "health.anomaly_alert":
      return handleHealthAnomalyAlert(input, opts?.traceId ?? "", opts?.provider ?? "claude");
    case "triage.intake_and_schedule":
      return handleTriageIntakeAndSchedule(input, opts?.traceId ?? "", opts?.provider ?? "claude");
    case "execute_trade":
      return { ok: false, data: { error: "capability_not_implemented" } };
    default:
      return { ok: false, data: { error: "unknown_capability" } };
  }
}

async function handleSchedulePropose(
  handle: string,
  input: unknown
) {
  const human = await prisma.human.findUnique({ where: { handle } });
  if (!human) return { ok: false, data: { error: "user_not_found" } };

  const inp = input as {
    title: string;
    durationMins: number;
    timeWindow: { start: string; end: string };
  };

  // Get busy slots
  const events = await prisma.calendarEvent.findMany({
    where: { humanId: human.id },
  });

  // Find free slots within the time window
  const freeSlots = findFreeSlots(
    events.map((e) => ({ start: e.startTs, end: e.endTs })),
    inp.timeWindow.start,
    inp.timeWindow.end,
    inp.durationMins
  );

  return {
    ok: true,
    data: {
      proposedSlots: freeSlots.slice(0, 3),
      message: `Found ${freeSlots.length} available slot(s) for "${inp.title}".`,
    },
  };
}

async function handleScheduleCounter(
  handle: string,
  input: unknown
) {
  const human = await prisma.human.findUnique({ where: { handle } });
  if (!human) return { ok: false, data: { error: "user_not_found" } };

  const inp = input as {
    proposedSlots: { start: string; end: string }[];
    durationMins: number;
  };

  const events = await prisma.calendarEvent.findMany({
    where: { humanId: human.id },
  });

  // Filter proposed slots against own calendar
  const acceptable = (inp.proposedSlots || []).filter((slot) => {
    return !events.some(
      (e) =>
        new Date(slot.start) < new Date(e.endTs) &&
        new Date(slot.end) > new Date(e.startTs)
    );
  });

  if (acceptable.length > 0) {
    return {
      ok: true,
      data: {
        proposedSlots: acceptable,
        message: `${acceptable.length} of the proposed slots work for me.`,
      },
    };
  }

  // Counter with own free slots
  const window = inp.proposedSlots[0];
  if (!window) return { ok: true, data: { proposedSlots: [], message: "No slots available." } };

  const freeSlots = findFreeSlots(
    events.map((e) => ({ start: e.startTs, end: e.endTs })),
    window.start,
    window.end,
    inp.durationMins || 30
  );

  return {
    ok: true,
    data: {
      proposedSlots: freeSlots.slice(0, 3),
      message: "None of those work. How about these instead?",
    },
  };
}

async function handleScheduleConfirm(input: unknown) {
  const inp = input as {
    chosenSlot: { start: string; end: string };
    title: string;
    participants: string[];
  };

  const booking = await prisma.booking.create({
    data: {
      id: uuid(),
      fromHandle: inp.participants[0] || "unknown",
      toHandle: inp.participants[1] || "unknown",
      startTs: inp.chosenSlot.start,
      endTs: inp.chosenSlot.end,
      title: inp.title,
    },
  });

  return {
    ok: true,
    data: { bookingId: booking.id, status: "confirmed" as const },
  };
}

async function handleHealthSummary(
  handle: string
): Promise<{ ok: boolean; data: HealthSummaryOutput | { error: string } }> {
  const human = await prisma.human.findUnique({ where: { handle } });
  if (!human) return { ok: false, data: { error: "user_not_found" } };

  const metrics = await prisma.healthMetric.findMany({
    where: { humanId: human.id },
    orderBy: { date: "desc" },
    take: 30,
  });

  if (metrics.length === 0) {
    return { ok: false, data: { error: "no_health_data" } };
  }

  const sleepAvg =
    metrics.reduce((s, m) => s + m.sleepHours, 0) / metrics.length;
  const stepsAvg =
    metrics.reduce((s, m) => s + m.steps, 0) / metrics.length;
  const adherentDays = metrics.filter((m) => m.medAdherence).length;
  const avgSymptom =
    metrics.reduce((s, m) => s + m.symptomScore, 0) / metrics.length;

  // Trends: compare first half vs second half
  const half = Math.floor(metrics.length / 2);
  const recent = metrics.slice(0, half);
  const older = metrics.slice(half);

  const recentSleepAvg =
    recent.reduce((s, m) => s + m.sleepHours, 0) / recent.length;
  const olderSleepAvg =
    older.reduce((s, m) => s + m.sleepHours, 0) / older.length;
  const sleepTrend =
    recentSleepAvg > olderSleepAvg + 0.3
      ? "up"
      : recentSleepAvg < olderSleepAvg - 0.3
        ? "down"
        : "flat";

  const recentStepsAvg =
    recent.reduce((s, m) => s + m.steps, 0) / recent.length;
  const olderStepsAvg =
    older.reduce((s, m) => s + m.steps, 0) / older.length;
  const activityTrend =
    recentStepsAvg > olderStepsAvg + 500
      ? "up"
      : recentStepsAvg < olderStepsAvg - 500
        ? "down"
        : "flat";

  // Flags
  const sleepFlags: string[] = [];
  if (sleepAvg < 6) sleepFlags.push("Below recommended 7h average");
  metrics.forEach((m) => {
    if (m.sleepHours < 5)
      sleepFlags.push(`Very low sleep on ${m.date}: ${m.sleepHours}h`);
  });

  // Symptom spikes
  const spikes: string[] = [];
  metrics.forEach((m) => {
    if (m.symptomScore > 7) spikes.push(`Spike on ${m.date}: ${m.symptomScore}/10`);
  });

  const notes: string[] = [];
  if (adherentDays < metrics.length * 0.8)
    notes.push("Medication adherence below 80% — consider reminders.");
  if (sleepAvg < 6.5)
    notes.push("Sleep average is low — may affect recovery.");

  const summary: HealthSummaryOutput = {
    rangeDays: metrics.length,
    sleep: {
      avg: Math.round(sleepAvg * 10) / 10,
      trend: sleepTrend as "up" | "down" | "flat",
      flags: sleepFlags.slice(0, 5),
    },
    activity: {
      avgSteps: Math.round(stepsAvg),
      trend: activityTrend as "up" | "down" | "flat",
    },
    medication: {
      adherencePct: Math.round((adherentDays / metrics.length) * 100),
      missedDays: metrics.length - adherentDays,
    },
    symptoms: {
      avgScore: Math.round(avgSymptom * 10) / 10,
      spikes: spikes.slice(0, 5),
    },
    notes,
  };

  return { ok: true, data: summary };
}

/* ── Helpers ── */

function findFreeSlots(
  busy: { start: string; end: string }[],
  windowStart: string,
  windowEnd: string,
  durationMins: number
): { start: string; end: string }[] {
  const slots: { start: string; end: string }[] = [];
  const ws = new Date(windowStart);
  const we = new Date(windowEnd);
  const dur = durationMins * 60 * 1000;

  // Sort busy by start
  const sorted = [...busy].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
  );

  let cursor = ws.getTime();

  for (const event of sorted) {
    const eStart = new Date(event.start).getTime();
    const eEnd = new Date(event.end).getTime();

    if (eStart < cursor) {
      cursor = Math.max(cursor, eEnd);
      continue;
    }

    // Check gap before this event
    while (cursor + dur <= eStart && cursor + dur <= we.getTime()) {
      // Only schedule during reasonable hours (9am-6pm)
      const d = new Date(cursor);
      const hour = d.getHours();
      if (hour >= 9 && hour < 18) {
        slots.push({
          start: new Date(cursor).toISOString(),
          end: new Date(cursor + dur).toISOString(),
        });
        if (slots.length >= 5) return slots;
      }
      cursor += 30 * 60 * 1000; // advance by 30min
    }

    cursor = Math.max(cursor, eEnd);
  }

  // Check remaining time after last event
  while (cursor + dur <= we.getTime()) {
    const d = new Date(cursor);
    const hour = d.getHours();
    if (hour >= 9 && hour < 18) {
      slots.push({
        start: new Date(cursor).toISOString(),
        end: new Date(cursor + dur).toISOString(),
      });
      if (slots.length >= 5) return slots;
    }
    cursor += 30 * 60 * 1000;
  }

  return slots;
}
