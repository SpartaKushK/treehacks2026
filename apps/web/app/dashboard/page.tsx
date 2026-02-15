"use client";

import { useEffect, useState } from "react";
import TopBar from "@/components/TopBar";
import AgentCard from "@/components/AgentCard";
import EmptyState from "@/components/EmptyState";
import PipelineDemo from "@/components/PipelineDemo";
import { useRouter } from "next/navigation";

interface Agent {
  handle: string;
  displayName: string;
  llmProvider: string;
  avatarPhotoUrl: string | null;
  capabilities: { id: string }[];
}

const FAMILY_CONTACTS = [
  {
    handle: "raj_sharma",
    displayName: "Raj Sharma",
    relation: "Husband",
    avatarUrl: "https://files2.heygen.ai/avatar/v3/17ad4b824e5a47e8b4f61e6a9cd346e7_62180/preview_target.webp",
  },
  {
    handle: "priya_sharma",
    displayName: "Priya Sharma",
    relation: "Daughter",
    avatarUrl: "https://files2.heygen.ai/avatar/v3/cc0dc576a0b249759f8e26fd892e1a76_39540/preview_target.webp",
  },
  {
    handle: "arjun_sharma",
    displayName: "Arjun Sharma",
    relation: "Son",
    avatarUrl: "https://files2.heygen.ai/avatar/v3/6ff8854f65b947718a29941f6d24a4d2_62160/preview_target.webp",
  },
];

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

        {/* Health Monitoring Pipeline */}
        <PipelineDemo />

        {/* Care Team section */}
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

        <div className="agent-grid">
          {/* Family contacts — rendered as agent cards with HeyGen avatars */}
          {FAMILY_CONTACTS.map((contact) => (
            <div key={contact.handle} className="agent-card" style={{ cursor: "default" }}>
              <div className="agent-card-header">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={contact.avatarUrl}
                  alt={contact.displayName}
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 14,
                    objectFit: "cover",
                    border: "2px solid #F5EDE3",
                    flexShrink: 0,
                  }}
                />
                <div>
                  <div className="agent-card-name">{contact.displayName}</div>
                  <div className="agent-card-handle">{contact.relation}</div>
                </div>
              </div>
              <div className="agent-card-meta">
                <span className="badge badge-green">Family</span>
                <span className="badge badge-blue">Emergency Contact</span>
              </div>
            </div>
          ))}

          {/* AI care agents */}
          {loading ? (
            <div style={{ padding: "2rem", textAlign: "center", gridColumn: "1 / -1" }}>
              <span className="spinner" />
            </div>
          ) : agents.length === 0 ? (
            <EmptyState title="No care agents yet" subtitle="Create an agent to start monitoring patients." />
          ) : (
            <>
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
            </>
          )}
        </div>

        {/* Quick actions */}
        <div className="agent-section-header">
          <span className="agent-section-title">Quick Actions</span>
          <span className="agent-section-line" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem" }}>
          <button
            className="agent-perm-card"
            style={{
              cursor: "pointer",
              textAlign: "left",
              background: "var(--bg-card)",
              padding: "1.25rem",
              minHeight: "120px",
            }}
            onClick={() => router.push("/dashboard/demo")}
          >
            <div className="agent-perm-tier" style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>
              Live Demo
            </div>
            <div className="agent-perm-sub" style={{ fontSize: "0.875rem" }}>
              See how CareSync protects patients in real time
            </div>
          </button>

          <button
            className="agent-perm-card"
            style={{
              cursor: "pointer",
              textAlign: "left",
              background: "var(--bg-card)",
              padding: "1.25rem",
              minHeight: "120px",
            }}
            onClick={() => router.push("/dashboard/anomaly")}
          >
            <div className="agent-perm-tier" style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>
              Patient Alerts
            </div>
            <div className="agent-perm-sub" style={{ fontSize: "0.875rem" }}>
              Review urgent patient health alerts and escalations
            </div>
          </button>

          <button
            className="agent-perm-card"
            style={{
              cursor: "pointer",
              textAlign: "left",
              background: "var(--bg-card)",
              padding: "1.25rem",
              minHeight: "120px",
            }}
            onClick={() => router.push("/patient")}
          >
            <div className="agent-perm-tier" style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>
              Patient View
            </div>
            <div className="agent-perm-sub" style={{ fontSize: "0.875rem" }}>
              See the elderly-friendly patient interface
            </div>
          </button>
        </div>
        <div className="agent-footer">CARESYNC — TREEHACKS 2026</div>
      </div>
    </>
  );
}
