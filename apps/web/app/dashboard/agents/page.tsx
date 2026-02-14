"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import TopBar from "@/components/TopBar";
import AgentCard from "@/components/AgentCard";
import EmptyState from "@/components/EmptyState";

interface Agent {
  handle: string;
  displayName: string;
  llmProvider: string;
  avatarPhotoUrl: string | null;
  capabilities: { id: string }[];
}

interface UnclaimedAgent {
  handle: string;
  displayName: string;
}

function AgentsPageInner() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [unclaimed, setUnclaimed] = useState<UnclaimedAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newHandle, setNewHandle] = useState("");
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("create") === "true") setShowCreate(true);
    loadAgents();
  }, [searchParams]);

  async function loadAgents() {
    setLoading(true);
    const res = await fetch("/api/agents");
    const data = await res.json();
    setAgents(data.agents || []);
    setUnclaimed(data.unclaimed || []);
    setLoading(false);
  }

  async function createAgent() {
    if (!newHandle.trim() || !newName.trim()) return;
    setCreating(true);
    const res = await fetch("/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle: newHandle.trim(), displayName: newName.trim() }),
    });
    if (res.ok) {
      setNewHandle("");
      setNewName("");
      setShowCreate(false);
      await loadAgents();
    }
    setCreating(false);
  }

  async function claimAgent(handle: string) {
    const res = await fetch("/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle, claim: true }),
    });
    if (res.ok) await loadAgents();
  }

  return (
    <>
      <TopBar title="Agents" />
      <div className="dashboard-content">
        {/* Header */}
        <div style={{ marginBottom: "1.5rem" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>
            Agent Registry
          </h1>
          <p style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>
            Create, claim, and configure your AI agent endpoints
          </p>
        </div>

        {/* Stats */}
        <div className="agent-stats" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          <div className="agent-stat">
            <div className="agent-stat-val">{agents.length}</div>
            <div className="agent-stat-lbl">Your Agents</div>
          </div>
          <div className="agent-stat">
            <div className="agent-stat-val">{unclaimed.length}</div>
            <div className="agent-stat-lbl">Available to Claim</div>
          </div>
          <div className="agent-stat">
            <div className="agent-stat-val">
              {agents.reduce((sum, a) => sum + a.capabilities.length, 0)}
            </div>
            <div className="agent-stat-lbl">Total Capabilities</div>
          </div>
        </div>

        {/* Your Agents */}
        <div className="agent-section-header">
          <span className="agent-section-title">Your Agents</span>
          <span className="agent-section-line" />
          <button
            className="btn btn-primary"
            style={{ fontSize: "0.75rem", padding: "0.375rem 0.875rem" }}
            onClick={() => setShowCreate(!showCreate)}
          >
            + Create Agent
          </button>
        </div>

        {showCreate && (
          <div
            style={{
              marginBottom: "1.5rem",
              padding: "1.25rem",
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "10px",
            }}
          >
            <div style={{ fontSize: "0.65rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-dim)", marginBottom: "0.75rem" }}>
              Create New Agent
            </div>
            <div className="row" style={{ gap: "0.75rem", alignItems: "flex-end" }}>
              <div className="field">
                <label>Handle</label>
                <input
                  placeholder="my_agent"
                  value={newHandle}
                  onChange={(e) => setNewHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                />
              </div>
              <div className="field">
                <label>Display Name</label>
                <input
                  placeholder="My Agent"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <button className="btn btn-primary" onClick={createAgent} disabled={creating}>
                {creating ? <><span className="spinner" /> Creating...</> : "Create"}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ padding: "2rem", textAlign: "center" }}><span className="spinner" /></div>
        ) : agents.length === 0 ? (
          <EmptyState message="No agents yet. Create one or claim a demo agent below." />
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

        {/* Unclaimed demo agents */}
        {unclaimed.length > 0 && (
          <>
            <div className="agent-section-header">
              <span className="agent-section-title">Available Demo Agents</span>
              <span className="agent-section-line" />
              <span className="agent-section-count">{unclaimed.length} available</span>
            </div>
            <p style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginBottom: "0.75rem" }}>
              Claim a demo agent to link it to your account and start configuring it.
            </p>
            <div className="agent-grid">
              {unclaimed.map((a) => (
                <div
                  key={a.handle}
                  style={{
                    padding: "1rem 1.25rem",
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderRadius: "10px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "0.875rem" }}>{a.displayName}</div>
                    <div style={{ fontFamily: "monospace", fontSize: "0.7rem", color: "var(--text-dim)" }}>@{a.handle}</div>
                  </div>
                  <button
                    className="agent-copy-btn"
                    onClick={() => claimAgent(a.handle)}
                  >
                    CLAIM
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="agent-footer">PEOPLE API — TREEHACKS 2026</div>
      </div>
    </>
  );
}

export default function AgentsPage() {
  return (
    <Suspense fallback={
      <>
        <TopBar title="Agents" />
        <div className="dashboard-content" style={{ textAlign: "center", padding: "3rem" }}>
          <span className="spinner" />
        </div>
      </>
    }>
      <AgentsPageInner />
    </Suspense>
  );
}
