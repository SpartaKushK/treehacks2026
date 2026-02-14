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
