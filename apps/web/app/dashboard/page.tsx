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

  return (
    <>
      <TopBar title="Dashboard" />
      <div className="dashboard-content">
        <div className="section-header">
          <h2>Your Agents</h2>
          <button
            className="btn btn-primary"
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
              />
            ))}
          </div>
        )}

        {/* Quick stats */}
        <div className="stats-row" style={{ marginTop: "2rem" }}>
          <div className="stat-card">
            <div className="stat-value">{agents.length}</div>
            <div className="stat-label">Active Agents</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">
              {agents.reduce((sum, a) => sum + a.capabilities.length, 0)}
            </div>
            <div className="stat-label">Total Capabilities</div>
          </div>
        </div>
      </div>
    </>
  );
}
