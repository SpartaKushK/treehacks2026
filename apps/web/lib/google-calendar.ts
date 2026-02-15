import { prisma } from "./store";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";

interface GoogleTokens {
  access_token: string;
  refresh_token: string;
  expiry: number; // epoch ms
}

/** Get and refresh Google Calendar tokens for a human. */
async function getTokens(humanId: string): Promise<GoogleTokens | null> {
  const human = await prisma.human.findUnique({
    where: { id: humanId },
    select: { googleCalendarTokens: true },
  });

  if (!human?.googleCalendarTokens) return null;

  const tokens: GoogleTokens = JSON.parse(human.googleCalendarTokens);

  // Refresh if expired (with 5min buffer)
  if (Date.now() > tokens.expiry - 300_000) {
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
        refresh_token: tokens.refresh_token,
        grant_type: "refresh_token",
      }),
    });

    if (!res.ok) return null;

    const data = await res.json();
    tokens.access_token = data.access_token;
    tokens.expiry = Date.now() + data.expires_in * 1000;

    await prisma.human.update({
      where: { id: humanId },
      data: { googleCalendarTokens: JSON.stringify(tokens) },
    });
  }

  return tokens;
}

/** Fetch events from Google Calendar. */
export async function fetchGoogleEvents(
  humanId: string,
  timeMin: string,
  timeMax: string
): Promise<{ id: string; summary: string; start: string; end: string }[]> {
  const tokens = await getTokens(humanId);
  if (!tokens) return [];

  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "50",
  });

  const res = await fetch(
    `${GOOGLE_CALENDAR_API}/calendars/primary/events?${params}`,
    {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    }
  );

  if (!res.ok) return [];

  const data = await res.json();
  return (data.items || []).map((item: Record<string, unknown>) => ({
    id: item.id as string,
    summary: (item.summary as string) || "Untitled",
    start: ((item.start as Record<string, string>)?.dateTime || (item.start as Record<string, string>)?.date) as string,
    end: ((item.end as Record<string, string>)?.dateTime || (item.end as Record<string, string>)?.date) as string,
  }));
}

/** Create a Google Calendar event. Returns the event ID. */
export async function createGoogleEvent(
  humanId: string,
  event: { summary: string; start: string; end: string; description?: string }
): Promise<string | null> {
  const tokens = await getTokens(humanId);
  if (!tokens) return null;

  const res = await fetch(
    `${GOOGLE_CALENDAR_API}/calendars/primary/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: event.summary,
        description: event.description || "",
        start: { dateTime: event.start },
        end: { dateTime: event.end },
      }),
    }
  );

  if (!res.ok) return null;

  const data = await res.json();
  return data.id;
}

/**
 * Get all busy time slots for a user by merging Google Calendar events
 * with locally stored events. Returns a unified list of busy periods.
 */
export async function getBusySlots(
  humanId: string,
  timeMin: string,
  timeMax: string
): Promise<{ start: string; end: string; summary: string }[]> {
  // 1. Fetch Google Calendar events (returns [] if not connected)
  const googleEvents = await fetchGoogleEvents(humanId, timeMin, timeMax);

  // 2. Fetch local DB events
  const localEvents = await prisma.calendarEvent.findMany({
    where: {
      humanId,
      startTs: { gte: timeMin },
      endTs: { lte: timeMax },
    },
    orderBy: { startTs: "asc" },
  });

  // 3. Merge, deduplicating by googleEventId
  const googleIds = new Set(googleEvents.map((e) => e.id));
  const merged: { start: string; end: string; summary: string }[] = [];

  for (const ge of googleEvents) {
    merged.push({ start: ge.start, end: ge.end, summary: ge.summary });
  }

  for (const le of localEvents) {
    // Skip if this local event was already included from Google
    if (le.googleEventId && googleIds.has(le.googleEventId)) continue;
    merged.push({ start: le.startTs, end: le.endTs, summary: le.title });
  }

  // Sort by start time
  merged.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  return merged;
}

/**
 * Find available time slots for a user by checking both Google Calendar
 * and local events. Returns free slots of the requested duration within
 * the time window, filtered to reasonable hours (9am–6pm, skip weekends).
 */
export async function findAvailableSlots(
  humanId: string,
  windowStart: string,
  windowEnd: string,
  durationMins: number,
  maxSlots: number = 5
): Promise<{ start: string; end: string }[]> {
  const busy = await getBusySlots(humanId, windowStart, windowEnd);

  const slots: { start: string; end: string }[] = [];
  const we = new Date(windowEnd).getTime();
  const dur = durationMins * 60 * 1000;
  const STEP = 10 * 60 * 1000; // step in 10-minute increments

  // Round window start UP to the nearest 10-minute mark
  const rawStart = new Date(windowStart).getTime();
  const roundedStart = Math.ceil(rawStart / STEP) * STEP;

  // Sort busy by start
  const sorted = [...busy].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
  );

  let cursor = roundedStart;

  for (const event of sorted) {
    const eStart = new Date(event.start).getTime();
    const eEnd = new Date(event.end).getTime();

    if (eStart < cursor) {
      // Round cursor up to nearest 10 min after event ends
      cursor = Math.ceil(Math.max(cursor, eEnd) / STEP) * STEP;
      continue;
    }

    // Check gaps before this event
    while (cursor + dur <= eStart && cursor + dur <= we) {
      const d = new Date(cursor);
      const hour = d.getHours();
      const day = d.getDay();
      // Only during business hours, skip weekends
      if (hour >= 9 && hour < 18 && day !== 0 && day !== 6) {
        slots.push({
          start: new Date(cursor).toISOString(),
          end: new Date(cursor + dur).toISOString(),
        });
        if (slots.length >= maxSlots) return slots;
      }
      cursor += STEP;
    }

    // Round cursor up to nearest 10 min after event ends
    cursor = Math.ceil(Math.max(cursor, eEnd) / STEP) * STEP;
  }

  // Check remaining time after last event
  while (cursor + dur <= we) {
    const d = new Date(cursor);
    const hour = d.getHours();
    const day = d.getDay();
    if (hour >= 9 && hour < 18 && day !== 0 && day !== 6) {
      slots.push({
        start: new Date(cursor).toISOString(),
        end: new Date(cursor + dur).toISOString(),
      });
      if (slots.length >= maxSlots) return slots;
    }
    cursor += STEP;
  }

  return slots;
}

/**
 * Book an event: creates it on Google Calendar (if connected) and saves locally.
 * Returns the local CalendarEvent id and optional Google event id.
 */
export async function bookCalendarEvent(
  humanId: string,
  event: { summary: string; start: string; end: string; description?: string }
): Promise<{ localId: string; googleEventId: string | null }> {
  // Try to create on Google Calendar
  const googleEventId = await createGoogleEvent(humanId, event);

  // Save locally
  const local = await prisma.calendarEvent.create({
    data: {
      humanId,
      title: event.summary,
      startTs: event.start,
      endTs: event.end,
      googleEventId: googleEventId ?? undefined,
      source: googleEventId ? "google" : "local",
    },
  });

  return { localId: local.id, googleEventId };
}

/** Two-way sync: pull Google events into local CalendarEvent, push local bookings to Google. */
export async function syncCalendar(humanId: string): Promise<void> {
  // Pull: Get next 30 days of Google events
  const now = new Date();
  const future = new Date(now);
  future.setDate(future.getDate() + 30);

  const googleEvents = await fetchGoogleEvents(
    humanId,
    now.toISOString(),
    future.toISOString()
  );

  // Upsert Google events into local CalendarEvent
  for (const ge of googleEvents) {
    const existing = await prisma.calendarEvent.findFirst({
      where: { humanId, googleEventId: ge.id },
    });

    if (!existing) {
      await prisma.calendarEvent.create({
        data: {
          humanId,
          title: ge.summary,
          startTs: ge.start,
          endTs: ge.end,
          googleEventId: ge.id,
          source: "google",
        },
      });
    } else {
      await prisma.calendarEvent.update({
        where: { id: existing.id },
        data: {
          title: ge.summary,
          startTs: ge.start,
          endTs: ge.end,
        },
      });
    }
  }
}
