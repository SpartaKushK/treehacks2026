"use client";

import { useEffect, useState } from "react";
import TopBar from "@/components/TopBar";

// Mock calendar events for when no real data is available
const MOCK_EVENTS: CalEvent[] = [
  {
    id: "mock-1",
    title: "Dr. Smith - Routine Checkup",
    startTs: new Date(Date.now() + 86400000 * 2).toISOString().replace(/T.*/, 'T09:00:00'),
    endTs: new Date(Date.now() + 86400000 * 2).toISOString().replace(/T.*/, 'T10:00:00'),
    source: "manual",
    googleEventId: null,
  },
  {
    id: "mock-2",
    title: "Medication Review - Pharmacist",
    startTs: new Date(Date.now() + 86400000 * 3).toISOString().replace(/T.*/, 'T14:30:00'),
    endTs: new Date(Date.now() + 86400000 * 3).toISOString().replace(/T.*/, 'T15:00:00'),
    source: "manual",
    googleEventId: null,
  },
  {
    id: "mock-3",
    title: "Physical Therapy Session",
    startTs: new Date(Date.now() + 86400000 * 4).toISOString().replace(/T.*/, 'T11:00:00'),
    endTs: new Date(Date.now() + 86400000 * 4).toISOString().replace(/T.*/, 'T12:00:00'),
    source: "manual",
    googleEventId: null,
  },
  {
    id: "mock-4",
    title: "Follow-up Call - Care Coordinator",
    startTs: new Date(Date.now() + 86400000 * 5).toISOString().replace(/T.*/, 'T10:00:00'),
    endTs: new Date(Date.now() + 86400000 * 5).toISOString().replace(/T.*/, 'T10:30:00'),
    source: "manual",
    googleEventId: null,
  },
  {
    id: "mock-5",
    title: "Blood Pressure Check - Home Visit",
    startTs: new Date(Date.now() + 86400000 * 7).toISOString().replace(/T.*/, 'T15:00:00'),
    endTs: new Date(Date.now() + 86400000 * 7).toISOString().replace(/T.*/, 'T15:30:00'),
    source: "manual",
    googleEventId: null,
  },
];

interface CalEvent {
  id: string;
  title: string;
  startTs: string;
  endTs: string;
  source: string;
  googleEventId: string | null;
}

interface AgentOption {
  handle: string;
  displayName: string;
  hasGoogle: boolean;
}

export default function CalendarPage() {
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [selectedAgent, setSelectedAgent] = useState("");
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((data) => {
        const agentList = (data.agents || []).map((a: Record<string, unknown>) => ({
          handle: a.handle as string,
          displayName: a.displayName as string,
          hasGoogle: !!a.googleCalendarTokens,
        }));
        setAgents(agentList);
        if (agentList.length > 0) setSelectedAgent(agentList[0].handle);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedAgent) return;
    loadEvents();
  }, [selectedAgent]);

  async function loadEvents() {
    const res = await fetch(`/api/calendar/events?handle=${selectedAgent}`);
    const data = await res.json();
    setEvents(data.events || []);
  }

  async function syncCalendar() {
    setSyncing(true);
    await fetch("/api/calendar/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle: selectedAgent }),
    });
    await loadEvents();
    setSyncing(false);
  }

  const selectedAgentData = agents.find((a) => a.handle === selectedAgent);

  // Use mock events if no real events exist
  const displayEvents = events.length > 0 ? events : MOCK_EVENTS;

  // Group events by date
  const eventsByDate: Record<string, CalEvent[]> = {};
  displayEvents.forEach((e) => {
    const date = new Date(e.startTs).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    if (!eventsByDate[date]) eventsByDate[date] = [];
    eventsByDate[date].push(e);
  });

  return (
    <>
      <TopBar title="Schedule" />
      <div className="dashboard-content">
        {/* Header */}
        <div style={{ marginBottom: "1.5rem" }}>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: "0.5rem", lineHeight: "1.3" }}>
            Care Schedule
          </h1>
          <p style={{ fontSize: "1rem", color: "var(--text-dim)", lineHeight: "1.6" }}>
            Upcoming appointments, care visits, and check-ins for your patients
          </p>
        </div>

        {/* Stats */}
        <div className="agent-stats" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          <div className="agent-stat">
            <div className="agent-stat-val">{events.length}</div>
            <div className="agent-stat-lbl">Upcoming Visits</div>
          </div>
          <div className="agent-stat">
            <div className="agent-stat-val">{Object.keys(eventsByDate).length}</div>
            <div className="agent-stat-lbl">Active Days</div>
          </div>
          <div className="agent-stat">
            <div className="agent-stat-val" style={{ color: selectedAgentData?.hasGoogle ? "var(--green)" : "var(--text-dim)" }}>
              {selectedAgentData?.hasGoogle ? "LINKED" : "—"}
            </div>
            <div className="agent-stat-lbl">Google Calendar</div>
          </div>
        </div>

        {/* Agent selector + controls */}
        <div className="agent-section-header">
          <span className="agent-section-title">Appointments</span>
          <span className="agent-section-line" />
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <select
              className="filter-select"
              value={selectedAgent}
              onChange={(e) => setSelectedAgent(e.target.value)}
            >
              {agents.map((a) => (
                <option key={a.handle} value={a.handle}>{a.displayName} (@{a.handle})</option>
              ))}
            </select>
            {selectedAgentData?.hasGoogle ? (
              <button
                className="agent-config-btn"
                onClick={syncCalendar}
                disabled={syncing}
              >
                {syncing ? "SYNCING..." : "SYNC GOOGLE"}
              </button>
            ) : selectedAgentData ? (
              <button
                className="btn btn-primary"
                style={{ fontSize: "0.875rem", padding: "0.5rem 1rem", minHeight: "44px" }}
                onClick={() => window.location.href = `/api/google/connect?handle=${selectedAgent}`}
              >
                Connect Google
              </button>
            ) : null}
          </div>
        </div>

        {loading ? (
          <div style={{ padding: "2rem", textAlign: "center" }}><span className="spinner" /></div>
        ) : (
          <>
            {events.length === 0 && (
              <div
                style={{
                  padding: "1rem 1.25rem",
                  marginBottom: "1rem",
                  background: "#E6F5F2",
                  border: "1px solid #1A7A6D",
                  borderRadius: "8px",
                  fontSize: "1rem",
                  color: "#1A7A6D",
                  lineHeight: "1.5",
                }}
              >
                📅 <strong>Showing example appointments</strong> — Connect your calendar to see real schedule
              </div>
            )}
            <div className="calendar-list">
            {Object.entries(eventsByDate).map(([date, dayEvents]) => (
              <div key={date}>
                <div className="calendar-day-header">{date}</div>
                {dayEvents.map((event) => (
                  <div key={event.id} className="calendar-event">
                    <div className="calendar-event-time">
                      {new Date(event.startTs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      {" - "}
                      {new Date(event.endTs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </div>
                    <div className="calendar-event-title">{event.title}</div>
                    <span className={`badge ${event.source === "google" ? "badge-blue" : "badge-purple"}`} style={{ fontSize: "0.8125rem", lineHeight: "1.4" }}>
                      {event.source}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          </>
        )}

        <div className="agent-footer">CARESYNC — TREEHACKS 2026</div>
      </div>
    </>
  );
}
