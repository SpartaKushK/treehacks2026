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
          <h1 style={{ fontFamily: "'Bitter', Georgia, serif", fontSize: "1.75rem", fontWeight: 700, marginBottom: "0.5rem", color: "#2D2A26", lineHeight: "1.3" }}>
            Clinical Dashboard
          </h1>
          <p style={{ fontSize: "1rem", color: "var(--text-dim)", lineHeight: 1.6 }}>
            Monitor patient wellbeing, review patient alerts, and coordinate care
          </p>
        </div>

        {/* Stats bar */}
        <div className="agent-stats" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          <div className="agent-stat">
            <div className="agent-stat-val">{agents.length}</div>
            <div className="agent-stat-lbl">Care Agents</div>
          </div>
          <div className="agent-stat">
            <div className="agent-stat-val">{totalCaps}</div>
            <div className="agent-stat-lbl">Active Services</div>
          </div>
          <div className="agent-stat">
            <div className="agent-stat-val" style={{ color: "#1A7A6D" }}>
              {agents.length > 0 ? "ONLINE" : "\u2014"}
            </div>
            <div className="agent-stat-lbl">System Status</div>
          </div>
        </div>

        {/* Agents section */}
        <div className="agent-section-header">
          <span className="agent-section-title">Your Care Team</span>
          <span className="agent-section-line" />
          <button
            className="btn btn-primary"
            style={{ fontSize: "0.875rem", padding: "0.5rem 1rem", minHeight: "44px" }}
            onClick={() => router.push("/dashboard/agents?create=true")}
          >
            + Add Care Agent
          </button>
        </div>

        {loading ? (
          <div style={{ padding: "2rem", textAlign: "center" }}>
            <span className="spinner" />
          </div>
        ) : agents.length === 0 ? (
          <EmptyState
            message="No care agents set up yet. Create one or claim a demo agent to begin monitoring."
            actionLabel="Add Care Agent"
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem" }}>
          <button
            className="agent-perm-card"
            style={{ cursor: "pointer", textAlign: "left", background: "var(--bg-card)", padding: "1.25rem", minHeight: "120px" }}
            onClick={() => router.push("/dashboard/demo")}
          >
            <div className="agent-perm-tier" style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>Live Demo</div>
            <div className="agent-perm-sub" style={{ fontSize: "0.875rem" }}>See how CareSync protects patients in real time</div>
          </button>
          <button
            className="agent-perm-card"
            style={{ cursor: "pointer", textAlign: "left", background: "var(--bg-card)", padding: "1.25rem", minHeight: "120px" }}
            onClick={() => router.push("/dashboard/anomaly")}
          >
            <div className="agent-perm-tier" style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>Patient Alerts</div>
            <div className="agent-perm-sub" style={{ fontSize: "0.875rem" }}>Review urgent patient health alerts and escalations</div>
          </button>
          <button
            className="agent-perm-card"
            style={{ cursor: "pointer", textAlign: "left", background: "var(--bg-card)", padding: "1.25rem", minHeight: "120px" }}
            onClick={() => router.push("/patient")}
          >
            <div className="agent-perm-tier" style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>Patient View</div>
            <div className="agent-perm-sub" style={{ fontSize: "0.875rem" }}>See the elderly-friendly patient interface</div>
          </button>
        </div>

        <div className="agent-footer">CARESYNC — TREEHACKS 2026</div>
      </div>
    </>
  );
}
