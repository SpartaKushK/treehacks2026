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
      <TopBar title="Calendar" />
      <div className="dashboard-content">
        <div className="section-header">
          <div className="row" style={{ gap: "0.75rem" }}>
            <div className="field">
              <label>Agent</label>
              <select value={selectedAgent} onChange={(e) => setSelectedAgent(e.target.value)}>
                {agents.map((a) => (
                  <option key={a.handle} value={a.handle}>{a.displayName} (@{a.handle})</option>
                ))}
              </select>
            </div>
            {selectedAgentData?.hasGoogle && (
              <button className="btn btn-secondary" onClick={syncCalendar} disabled={syncing}>
                {syncing ? <><span className="spinner" /> Syncing...</> : "Sync Google Calendar"}
              </button>
            )}
          </div>
          {selectedAgentData && !selectedAgentData.hasGoogle && (
            <button
              className="btn btn-primary"
              onClick={() => window.location.href = `/api/google/connect?handle=${selectedAgent}`}
            >
              Connect Google Calendar
            </button>
          )}
        </div>

        {loading ? (
          <div style={{ padding: "2rem", textAlign: "center" }}><span className="spinner" /></div>
        ) : Object.keys(eventsByDate).length === 0 ? (
          <div className="card" style={{ textAlign: "center", color: "var(--text-dim)", fontSize: "0.85rem" }}>
            No calendar events. Connect Google Calendar or run a scheduling demo to populate events.
          </div>
        ) : (
          <div className="calendar-list">
            {Object.entries(eventsByDate).map(([date, dayEvents]) => (
              <div key={date} className="calendar-day">
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
      </div>
    </>
  );
}
