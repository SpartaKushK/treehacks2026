"use client";

import { useEffect, useState } from "react";
import TopBar from "@/components/TopBar";

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

  // Group events by date
  const eventsByDate: Record<string, CalEvent[]> = {};
  events.forEach((e) => {
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
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>
            Care Schedule
          </h1>
          <p style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>
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
                style={{ padding: "0.375rem 0.75rem" }}
              >
                {syncing ? "SYNCING..." : "SYNC GOOGLE"}
              </button>
            ) : selectedAgentData ? (
              <button
                className="btn btn-primary"
                style={{ fontSize: "0.7rem", padding: "0.375rem 0.75rem" }}
                onClick={() => window.location.href = `/api/google/connect?handle=${selectedAgent}`}
              >
                Connect Google
              </button>
            ) : null}
          </div>
        </div>

        {loading ? (
          <div style={{ padding: "2rem", textAlign: "center" }}><span className="spinner" /></div>
        ) : Object.keys(eventsByDate).length === 0 ? (
          <div
            style={{
              textAlign: "center",
              color: "var(--text-dim)",
              fontSize: "0.8rem",
              padding: "1.5rem",
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "10px",
            }}
          >
            No upcoming appointments. Connect Google Calendar or try the Live Demo to see scheduling in action.
          </div>
        ) : (
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
                    <span className={`badge ${event.source === "google" ? "badge-blue" : "badge-purple"}`} style={{ fontSize: "0.6rem" }}>
                      {event.source}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        <div className="agent-footer">CARESYNC — TREEHACKS 2026</div>
      </div>
    </>
  );
}
