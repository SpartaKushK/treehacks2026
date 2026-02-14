"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import TopBar from "@/components/TopBar";
import AgentCard from "@/components/AgentCard";
import EmptyState from "@/components/EmptyState";

interface Agent {
  handle: string;
  displayName: string;
  llmProvider: string;
  capabilities: { id: string }[];
}

interface UnclaimedAgent {
  handle: string;
  displayName: string;
}

export default function AgentsPage() {
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
        <div className="section-header">
          <h2>Your Agents</h2>
          <button className="btn btn-primary" onClick={() => setShowCreate(!showCreate)}>
            + Create Agent
          </button>
        </div>

        {showCreate && (
          <div className="card" style={{ marginBottom: "1.5rem" }}>
            <h2 style={{ fontSize: "1rem", marginBottom: "0.75rem" }}>Create New Agent</h2>
            <div className="row" style={{ marginBottom: "0.75rem" }}>
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
              />
            ))}
          </div>
        )}

        {/* Unclaimed demo agents */}
        {unclaimed.length > 0 && (
          <div style={{ marginTop: "2rem" }}>
            <h2 style={{ fontSize: "1rem", marginBottom: "0.75rem" }}>Claim Demo Agents</h2>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-dim)", marginBottom: "0.75rem" }}>
              These demo agents are available to claim. Claiming links them to your account.
            </p>
            <div className="agent-grid">
              {unclaimed.map((a) => (
                <div key={a.handle} className="card" style={{ padding: "1rem" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <strong>{a.displayName}</strong>
                      <div style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>@{a.handle}</div>
                    </div>
                    <button className="btn btn-secondary" onClick={() => claimAgent(a.handle)}>
                      Claim
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
