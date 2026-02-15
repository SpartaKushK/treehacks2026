"use client";

import { useEffect, useState } from "react";
import TopBar from "@/components/TopBar";
import AgentCard from "@/components/AgentCard";
import EmptyState from "@/components/EmptyState";
import { useRouter } from "next/navigation";

interface Agent {
  handle: string;
  displayName: string;
  llmProvider: string;
  avatarPhotoUrl: string | null;
  capabilities: { id: string }[];
}

export default function DashboardHome() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((data) => {
        setAgents(data.agents || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const totalCaps = agents.reduce((sum, a) => sum + a.capabilities.length, 0);

  return (
    <>
      <TopBar title="Dashboard" />
      <div className="dashboard-content">
        {/* Welcome */}
        <div style={{ marginBottom: "1.5rem" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>
            Command Center
          </h1>
          <p style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>
            Manage your agent endpoints, capabilities, and permissions
          </p>
        </div>

        {/* Stats bar */}
        <div className="agent-stats" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          <div className="agent-stat">
            <div className="agent-stat-val">{agents.length}</div>
            <div className="agent-stat-lbl">Active Agents</div>
          </div>
          <div className="agent-stat">
            <div className="agent-stat-val">{totalCaps}</div>
            <div className="agent-stat-lbl">Capabilities</div>
          </div>
          <div className="agent-stat">
            <div className="agent-stat-val" style={{ color: "var(--green)" }}>
              {agents.length > 0 ? "ONLINE" : "—"}
            </div>
            <div className="agent-stat-lbl">Network Status</div>
          </div>
        </div>

        {/* Agents section */}
        <div className="agent-section-header">
          <span className="agent-section-title">Your Agents</span>
          <span className="agent-section-line" />
          <button
            className="btn btn-primary"
            style={{ fontSize: "0.75rem", padding: "0.375rem 0.875rem" }}
            onClick={() => router.push("/dashboard/agents?create=true")}
          >
            + Create Agent
          </button>
        </div>

        {loading ? (
          <div style={{ padding: "2rem", textAlign: "center" }}>
            <span className="spinner" />
          </div>
        ) : agents.length === 0 ? (
          <EmptyState
            message="You don't have any agents yet. Create one or claim a demo agent to get started."
            actionLabel="Create Agent"
            onAction={() => router.push("/dashboard/agents?create=true")}
          />
        ) : (
          <div className="agent-grid">
            {agents.map((a) => (
              <AgentCard
                key={a.handle}
                handle={a.handle}
                displayName={a.displayName}
                capabilityCount={a.capabilities.length}
                llmProvider={a.llmProvider}
                avatarUrl={a.avatarPhotoUrl}
              />
            ))}
          </div>
        )}

        {/* Quick actions */}
        <div className="agent-section-header">
          <span className="agent-section-title">Quick Actions</span>
          <span className="agent-section-line" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.75rem" }}>
          <button
            className="agent-perm-card"
            style={{ cursor: "pointer", textAlign: "left", background: "var(--bg-card)" }}
            onClick={() => router.push("/dashboard/demo")}
          >
            <div className="agent-perm-tier">Demo</div>
            <div className="agent-perm-sub">Run interactive demos of agent capabilities</div>
          </button>
          <button
            className="agent-perm-card"
            style={{ cursor: "pointer", textAlign: "left", background: "var(--bg-card)" }}
            onClick={() => router.push("/dashboard/anomaly")}
          >
            <div className="agent-perm-tier">Anomaly</div>
            <div className="agent-perm-sub">Monitor health anomalies and alerts</div>
          </button>
          <button
            className="agent-perm-card"
            style={{ cursor: "pointer", textAlign: "left", background: "var(--bg-card)" }}
            onClick={() => router.push("/dashboard/calendar")}
          >
            <div className="agent-perm-tier">Calendar</div>
            <div className="agent-perm-sub">View and sync scheduled events</div>
          </button>
        </div>

        <div className="agent-footer">PEOPLE API — TREEHACKS 2026</div>
      </div>
    </>
  );
}
