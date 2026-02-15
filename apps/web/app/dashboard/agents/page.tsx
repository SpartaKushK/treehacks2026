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

interface HeyGenAvatar {
  avatar_id: string;
  avatar_name: string;
  preview_image_url: string;
  gender?: string;
  isCustom?: boolean;
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

  // Avatar selection for new agents
  const [avatars, setAvatars] = useState<HeyGenAvatar[]>([]);
  const [avatarsLoading, setAvatarsLoading] = useState(false);
  const [avatarsLoaded, setAvatarsLoaded] = useState(false);
  const [selectedAvatarId, setSelectedAvatarId] = useState<string | null>(null);
  const [selectedAvatarPhoto, setSelectedAvatarPhoto] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get("create") === "true") setShowCreate(true);
    loadAgents();
  }, [searchParams]);

  // Load avatars when create form is opened
  useEffect(() => {
    if (showCreate && !avatarsLoaded && !avatarsLoading) {
      setAvatarsLoading(true);
      fetch("/api/heygen/avatars")
        .then((r) => r.json())
        .then((data) => {
          setAvatars(data.avatars || []);
          setAvatarsLoaded(true);
          setAvatarsLoading(false);
        })
        .catch(() => {
          setAvatarsLoaded(true);
          setAvatarsLoading(false);
        });
    }
  }, [showCreate, avatarsLoaded, avatarsLoading]);

  async function loadAgents() {
    setLoading(true);
    try {
      const res = await fetch("/api/agents");
      const text = await res.text();
      if (!res.ok) {
        if (res.status === 401) {
          router.push("/sign-in");
          return;
        }
        setAgents([]);
        setUnclaimed([]);
        setLoading(false);
        return;
      }
      let data: { agents?: Agent[]; unclaimed?: UnclaimedAgent[] } = {};
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = {};
        }
      }
      setAgents(data.agents || []);
      setUnclaimed(data.unclaimed || []);
    } catch {
      setAgents([]);
      setUnclaimed([]);
    } finally {
      setLoading(false);
    }
  }

  async function createAgent() {
    if (!newHandle.trim() || !newName.trim()) return;
    setCreating(true);
    const res = await fetch("/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        handle: newHandle.trim(),
        displayName: newName.trim(),
        heygenAvatarId: selectedAvatarId,
        avatarPhotoUrl: selectedAvatarPhoto,
      }),
    });
    if (res.ok) {
      setNewHandle("");
      setNewName("");
      setSelectedAvatarId(null);
      setSelectedAvatarPhoto(null);
      setShowCreate(false);
      await loadAgents();
    }
    setCreating(false);
  }

  function selectAvatar(avatar: HeyGenAvatar) {
    setSelectedAvatarId(avatar.avatar_id);
    setSelectedAvatarPhoto(avatar.preview_image_url);
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
      <TopBar title="Care Team" />
      <div className="dashboard-content">
        {/* Header */}
        <div style={{ marginBottom: "2rem" }}>
          <h1 style={{ fontSize: "2rem", fontWeight: 700, marginBottom: "0.5rem", lineHeight: "1.3" }}>
            Care Team
          </h1>
          <p style={{ fontSize: "1.125rem", color: "var(--text-dim)", lineHeight: 1.6 }}>
            Set up and manage the AI agents that look after your patients
          </p>
        </div>

        {/* Stats */}
        <div className="agent-stats" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          <div className="agent-stat">
            <div className="agent-stat-val">{agents.length}</div>
            <div className="agent-stat-lbl">Your Care Agents</div>
          </div>
          <div className="agent-stat">
            <div className="agent-stat-val">{unclaimed.length}</div>
            <div className="agent-stat-lbl">Available to Add</div>
          </div>
          <div className="agent-stat">
            <div className="agent-stat-val">
              {agents.reduce((sum, a) => sum + a.capabilities.length, 0)}
            </div>
            <div className="agent-stat-lbl">Active Services</div>
          </div>
        </div>

        {/* Your Care Agents */}
        <div className="agent-section-header">
          <span className="agent-section-title">Your Care Agents</span>
          <span className="agent-section-line" />
          <button
            className="btn btn-primary"
            style={{ fontSize: "1rem", padding: "0.75rem 1.5rem", minHeight: "48px" }}
            onClick={() => setShowCreate(!showCreate)}
          >
            + Add Care Agent
          </button>
        </div>

        {showCreate && (
          <div
            style={{
              marginBottom: "1.5rem",
              padding: "1.5rem",
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "10px",
            }}
          >
            <h3 style={{ fontSize: "1.125rem", fontWeight: 700, marginBottom: "0.25rem", lineHeight: "1.4" }}>
              Add New Care Agent
            </h3>
            <p style={{ fontSize: "0.875rem", color: "var(--text-dim)", marginBottom: "1.25rem", lineHeight: "1.5" }}>
              Create an AI assistant to help coordinate care for your patients
            </p>
            <div className="row" style={{ gap: "0.75rem", alignItems: "flex-start" }}>
              <div className="field" style={{ flex: 1 }}>
                <label style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                  Unique Handle
                </label>
                <input
                  placeholder="my_care_agent"
                  value={newHandle}
                  onChange={(e) => setNewHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                  style={{ marginBottom: "0.5rem" }}
                />
                <p style={{ fontSize: "0.8125rem", color: "var(--text-dim)", lineHeight: "1.5", margin: 0 }}>
                  A unique identifier like a username. Use letters, numbers, and underscores only.
                  <br />
                  <span style={{ fontFamily: "monospace", fontSize: "0.8125rem" }}>Example: patient_care_bot</span>
                </p>
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                  Display Name (Visible to Users)
                </label>
                <input
                  placeholder="Patient Care Assistant"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  style={{ marginBottom: "0.5rem" }}
                />
                <p style={{ fontSize: "0.8125rem", color: "var(--text-dim)", lineHeight: "1.5", margin: 0 }}>
                  The friendly name people will see. Can include spaces and any characters.
                  <br />
                  <span style={{ fontFamily: "monospace", fontSize: "0.8125rem" }}>Example: My Care Agent</span>
                </p>
              </div>
              <button
                className="btn btn-primary"
                onClick={createAgent}
                disabled={creating}
                style={{ marginTop: "1.875rem", minWidth: "120px" }}
              >
                {creating ? <><span className="spinner" /> Creating...</> : "Create Agent"}
              </button>
            </div>

            {/* Avatar Picker */}
            <div style={{ marginTop: "1.5rem", paddingTop: "1.5rem", borderTop: "1px solid var(--border)" }}>
              <label style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "0.75rem", display: "block" }}>
                Choose Avatar (Optional)
              </label>
              {avatarsLoading ? (
                <div style={{ padding: "1rem", textAlign: "center" }}>
                  <span className="spinner" />
                  <p style={{ fontSize: "0.8125rem", color: "var(--text-dim)", marginTop: "0.5rem", lineHeight: "1.5" }}>Loading avatars...</p>
                </div>
              ) : avatars.length === 0 ? (
                <p style={{ fontSize: "0.8125rem", color: "var(--text-dim)", lineHeight: "1.5" }}>
                  No avatars available. You can select an avatar after creating the agent.
                </p>
              ) : (
                <>
                  {selectedAvatarPhoto && (
                    <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1rem", padding: "0.75rem", background: "var(--bg)", borderRadius: "8px", border: "2px solid var(--accent)" }}>
                      <img
                        src={selectedAvatarPhoto}
                        alt="Selected avatar"
                        style={{ width: 60, height: 60, borderRadius: 8, objectFit: "cover" }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: "0.875rem", fontWeight: 600 }}>Avatar Selected</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>
                          {avatars.find(a => a.avatar_id === selectedAvatarId)?.avatar_name || "Custom Avatar"}
                        </div>
                      </div>
                      <button
                        className="btn btn-secondary"
                        style={{ fontSize: "0.75rem", padding: "0.25rem 0.75rem" }}
                        onClick={() => {
                          setSelectedAvatarId(null);
                          setSelectedAvatarPhoto(null);
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  )}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))", gap: "0.5rem", maxHeight: 240, overflowY: "auto", padding: "0.25rem" }}>
                    {avatars.slice(0, 12).map((avatar) => (
                      <div
                        key={avatar.avatar_id}
                        onClick={() => selectAvatar(avatar)}
                        style={{
                          cursor: "pointer",
                          borderRadius: "0.5rem",
                          border: avatar.avatar_id === selectedAvatarId ? "2px solid var(--accent)" : "2px solid transparent",
                          padding: "0.25rem",
                          textAlign: "center",
                          transition: "transform 0.15s, border-color 0.15s",
                          background: avatar.avatar_id === selectedAvatarId ? "var(--bg)" : "transparent",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.05)")}
                        onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
                      >
                        <img
                          src={avatar.preview_image_url}
                          alt={avatar.avatar_name}
                          loading="lazy"
                          style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: "0.375rem" }}
                        />
                        <div style={{ fontSize: "0.8125rem", color: "var(--text-dim)", marginTop: "0.25rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: "1.4" }}>
                          {avatar.avatar_name}
                        </div>
                      </div>
                    ))}
                  </div>
                  {avatars.length > 12 && (
                    <p style={{ fontSize: "0.8125rem", color: "var(--text-dim)", marginTop: "0.5rem", textAlign: "center", lineHeight: "1.5" }}>
                      Showing 12 of {avatars.length} avatars. More available in agent settings after creation.
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ padding: "2rem", textAlign: "center" }}><span className="spinner" /></div>
        ) : agents.length === 0 ? (
          <EmptyState message="No care agents yet. Add one or claim a demo agent below." />
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
              <span className="agent-section-title">Available Demo Care Agents</span>
              <span className="agent-section-line" />
              <span className="agent-section-count">{unclaimed.length} available</span>
            </div>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-dim)", marginBottom: "0.75rem", lineHeight: "1.5" }}>
              Claim a demo care agent to link it to your account and start coordinating care.
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
                    <div style={{ fontWeight: 600, fontSize: "0.875rem", lineHeight: "1.4" }}>{a.displayName}</div>
                    <div style={{ fontFamily: "monospace", fontSize: "0.8125rem", color: "var(--text-dim)", lineHeight: "1.4" }}>@{a.handle}</div>
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

        <div className="agent-footer">CARESYNC — TREEHACKS 2026</div>
      </div>
    </>
  );
}

export default function AgentsPage() {
  return (
    <Suspense fallback={
      <>
        <TopBar title="Care Team" />
        <div className="dashboard-content" style={{ textAlign: "center", padding: "3rem" }}>
          <span className="spinner" />
        </div>
      </>
    }>
      <AgentsPageInner />
    </Suspense>
  );
}
