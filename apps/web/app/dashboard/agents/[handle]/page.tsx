"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";
import ProviderToggle from "@/components/ProviderToggle";
import StreamingAvatar, { type StreamingAvatarHandle } from "@/components/StreamingAvatar";
import QRCode from "@/components/QRCode";

interface Capability {
  id: string;
  name: string;
  description: string;
}

interface Policy {
  id: string;
  capabilityName: string;
  allowedCallersJson: string;
  requiredScopesJson: string;
  paymentRequired: boolean;
  priceCents: number;
}

interface AgentConfig {
  handle: string;
  displayName: string;
  publicKey: string;
  endpointUrl: string;
  llmProvider: string;
  personaPrompt: string | null;
  anomalyThresholdJson: string;
  googleCalendarTokens: string | null;
  heygenAvatarId: string | null;
  avatarPhotoUrl: string | null;
  agentType: string;
  specialty: string | null;
  clinicName: string | null;
  doctorCalendarEmail: string | null;
  capabilities: Capability[];
  policies: Policy[];
}

interface HeyGenAvatar {
  avatar_id: string;
  avatar_name: string;
  preview_image_url: string;
  gender?: string;
  isCustom?: boolean;
}

interface AnomalyAlert {
  id: string;
  severity: string;
  anomalyScore: number;
  flagsJson: string;
  decisionJson: string;
  status: string;
  createdAt: string;
  traceId?: string;
}

type Provider = "openai" | "claude";
type AvatarFilter = "all" | "custom" | "female" | "male";

// Capabilities split into personal (agent does for you) vs public (offered to network)
const PERSONAL_CAPABILITIES = [
  { name: "schedule_propose", description: "Propose meeting times", icon: "📅" },
  { name: "schedule_counter", description: "Counter-propose meeting times", icon: "🔄" },
  { name: "schedule_confirm", description: "Confirm a meeting booking", icon: "✅" },
  { name: "health.anomaly_alert", description: "Monitor and triage health anomalies", icon: "🔔" },
  { name: "triage.intake_and_schedule", description: "Run intake questions and schedule appointments", icon: "🏥" },
  { name: "execute_trade", description: "Execute a financial trade", icon: "📈" },
];

const PUBLIC_CAPABILITIES = [
  { name: "health_summary", description: "Other agents can request your health analytics", icon: "📊" },
];

const ALL_CAPABILITIES = [...PERSONAL_CAPABILITIES, ...PUBLIC_CAPABILITIES];

export default function AgentConfigPage() {
  const { handle } = useParams<{ handle: string }>();
  const router = useRouter();
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  // Editable state
  const [provider, setProvider] = useState<Provider>("claude");
  const [persona, setPersona] = useState("");
  const [urgentThreshold, setUrgentThreshold] = useState(85);
  const [soonThreshold, setSoonThreshold] = useState(70);
  const [enabledCaps, setEnabledCaps] = useState<Set<string>>(new Set());

  // Doctor-specific fields
  const [agentType, setAgentType] = useState<"patient" | "doctor">("patient");
  const [specialty, setSpecialty] = useState("");
  const [clinicName, setClinicName] = useState("");
  const [doctorCalendarEmail, setDoctorCalendarEmail] = useState("");

  // Avatar
  const [avatars, setAvatars] = useState<HeyGenAvatar[]>([]);
  const [avatarsLoaded, setAvatarsLoaded] = useState(false);
  const [selectedAvatarId, setSelectedAvatarId] = useState<string | null>(null);
  const [selectedAvatarPhoto, setSelectedAvatarPhoto] = useState<string | null>(null);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [avatarFilter, setAvatarFilter] = useState<AvatarFilter>("all");
  const [showStreamingAvatar, setShowStreamingAvatar] = useState(false);
  const [speakText, setSpeakText] = useState("");
  const avatarStreamRef = useRef<StreamingAvatarHandle>(null);

  // Policy editing
  const [editingPolicy, setEditingPolicy] = useState<string | null>(null);
  const [policyCallers, setPolicyCallers] = useState("");
  const [policyScopes, setPolicyScopes] = useState("");
  const [policyPayment, setPolicyPayment] = useState(false);
  const [policyPrice, setPolicyPrice] = useState(0);

  // Activity feed
  const [alerts, setAlerts] = useState<AnomalyAlert[]>([]);

  // Copied state
  const [copied, setCopied] = useState(false);

  // Settings expanded
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    fetch(`/api/agents/${handle}/config`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setLoading(false);
          return;
        }
        const safeData = {
          ...data,
          handle: data.handle || handle || "",
          displayName: data.displayName || handle || "",
          publicKey: data.publicKey || "",
          endpointUrl: data.endpointUrl || `agent://${handle}`,
          llmProvider: data.llmProvider || "claude",
          anomalyThresholdJson: data.anomalyThresholdJson || "{}",
          agentType: data.agentType || "patient",
          capabilities: data.capabilities || [],
          policies: data.policies || [],
        };
        setConfig(safeData);
        setProvider(safeData.llmProvider as Provider);
        setPersona(safeData.personaPrompt || "");
        const thresholds = JSON.parse(safeData.anomalyThresholdJson || "{}");
        setUrgentThreshold(thresholds.urgent ?? 85);
        setSoonThreshold(thresholds.soon ?? 70);
        setEnabledCaps(new Set(safeData.capabilities.map((c: Capability) => c.name)));
        setSelectedAvatarId(safeData.heygenAvatarId || null);
        setSelectedAvatarPhoto(safeData.avatarPhotoUrl || null);
        setAgentType((safeData.agentType as "patient" | "doctor") || "patient");
        setSpecialty(data.specialty || "");
        setClinicName(data.clinicName || "");
        setDoctorCalendarEmail(data.doctorCalendarEmail || "");
        setLoading(false);
      })
      .catch(() => setLoading(false));

    // Fetch recent alerts for activity feed
    fetch(`/api/anomaly/history?limit=5`)
      .then((r) => r.json())
      .then((data) => setAlerts(data.alerts || []))
      .catch(() => {});
  }, [handle]);

  // Pre-fetch avatars
  useEffect(() => {
    if (!avatarsLoaded) {
      fetch("/api/heygen/avatars")
        .then((r) => r.json())
        .then((data) => {
          setAvatars(data.avatars || []);
          setAvatarsLoaded(true);
        })
        .catch(() => setAvatarsLoaded(true));
    }
  }, [avatarsLoaded]);

  async function selectAvatar(avatar: HeyGenAvatar) {
    setSelectedAvatarId(avatar.avatar_id);
    setSelectedAvatarPhoto(avatar.preview_image_url);
    setShowAvatarPicker(false);
    await fetch(`/api/agents/${handle}/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        heygenAvatarId: avatar.avatar_id,
        avatarPhotoUrl: avatar.preview_image_url,
      }),
    });
    setSaveMsg("Avatar saved!");
    setTimeout(() => setSaveMsg(""), 2000);
  }

  async function removeAvatar() {
    setSelectedAvatarId(null);
    setSelectedAvatarPhoto(null);
    await fetch(`/api/agents/${handle}/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ heygenAvatarId: null, avatarPhotoUrl: null }),
    });
    setSaveMsg("Avatar removed!");
    setTimeout(() => setSaveMsg(""), 2000);
  }

  async function saveConfig() {
    setSaving(true);
    setSaveMsg("");
    const res = await fetch(`/api/agents/${handle}/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        llmProvider: provider,
        personaPrompt: persona || null,
        anomalyThresholds: { urgent: urgentThreshold, soon: soonThreshold },
        agentType,
        specialty: agentType === "doctor" ? specialty : null,
        clinicName: agentType === "doctor" ? clinicName : null,
        doctorCalendarEmail: agentType === "doctor" ? doctorCalendarEmail : null,
        capabilities: ALL_CAPABILITIES
          .filter((c) => enabledCaps.has(c.name))
          .map((c) => ({ name: c.name, description: c.description })),
      }),
    });
    if (res.ok) {
      setSaveMsg("Saved!");
      setTimeout(() => setSaveMsg(""), 2000);
    } else {
      setSaveMsg("Error saving");
    }
    setSaving(false);
  }

  function toggleCap(name: string) {
    setEnabledCaps((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function startEditPolicy(cap: string) {
    const policy = config?.policies.find((p) => p.capabilityName === cap);
    setEditingPolicy(cap);
    if (policy) {
      setPolicyCallers(JSON.parse(policy.allowedCallersJson).join(", "));
      setPolicyScopes(JSON.parse(policy.requiredScopesJson).join(", "));
      setPolicyPayment(policy.paymentRequired);
      setPolicyPrice(policy.priceCents);
    } else {
      setPolicyCallers("*");
      setPolicyScopes("");
      setPolicyPayment(false);
      setPolicyPrice(0);
    }
  }

  async function savePolicy() {
    if (!editingPolicy) return;
    const callers = policyCallers.split(",").map((s) => s.trim()).filter(Boolean);
    const scopes = policyScopes.split(",").map((s) => s.trim()).filter(Boolean);
    await fetch(`/api/agents/${handle}/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        policies: [{
          capabilityName: editingPolicy,
          allowedCallers: callers,
          requiredScopes: scopes,
          paymentRequired: policyPayment,
          priceCents: policyPrice,
        }],
      }),
    });
    const res = await fetch(`/api/agents/${handle}/config`);
    const data = await res.json();
    setConfig(data);
    setEditingPolicy(null);
  }

  function copyEndpoint() {
    if (!config) return;
    navigator.clipboard?.writeText(config.endpointUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // Filter avatars
  const filteredAvatars = avatars.filter((a) => {
    if (avatarFilter === "custom") return a.isCustom;
    if (avatarFilter === "female") return a.gender?.toLowerCase() === "female";
    if (avatarFilter === "male") return a.gender?.toLowerCase() === "male";
    return true;
  });
  const sortedAvatars = [...filteredAvatars].sort((a, b) => {
    if (a.isCustom && !b.isCustom) return -1;
    if (!a.isCustom && b.isCustom) return 1;
    return a.avatar_name.localeCompare(b.avatar_name);
  });
  const customCount = avatars.filter((a) => a.isCustom).length;

  // Get policy for a capability
  function getPolicy(capName: string): Policy | undefined {
    return config?.policies.find((p) => p.capabilityName === capName);
  }

  function formatPolicyCallers(policy: Policy | undefined): string {
    if (!policy) return "All agents";
    const callers = JSON.parse(policy.allowedCallersJson);
    if (callers.includes("*")) return "All agents";
    return callers.join(", ");
  }

  function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  if (loading) {
    return (
      <>
        <TopBar title="Care Agent Profile" />
        <div className="dashboard-content" style={{ textAlign: "center", padding: "3rem" }}>
          <span className="spinner" />
        </div>
      </>
    );
  }

  if (!config) {
    return (
      <>
        <TopBar title="Care Agent Profile" />
        <div className="dashboard-content">
          <div className="card">
            <p style={{ color: "var(--red)" }}>Agent not found or you don&apos;t own this agent.</p>
            <button className="btn btn-secondary" onClick={() => router.push("/dashboard/agents")} style={{ marginTop: "1rem" }}>
              Back to Care Team
            </button>
          </div>
        </div>
      </>
    );
  }

  const personalEnabled = PERSONAL_CAPABILITIES.filter((c) => enabledCaps.has(c.name));
  const publicEnabled = PUBLIC_CAPABILITIES.filter((c) => enabledCaps.has(c.name));

  return (
    <>
      <TopBar title={`@${config.handle}`} />
      <div className="dashboard-content" style={{ maxWidth: 1100 }}>

        {/* ── HERO: Identity + Endpoint + QR ── */}
        <div className="agent-hero">
          <div className="agent-hero-main">
            {/* Avatar + Identity */}
            <div className="agent-identity">
              <div style={{ position: "relative", flexShrink: 0 }}>
                {selectedAvatarPhoto ? (
                  <img
                    src={selectedAvatarPhoto}
                    alt={config.displayName}
                    className="agent-avatar-lg"
                  />
                ) : (
                  <div className="agent-avatar-lg agent-avatar-placeholder">
                    {(config.displayName || handle || "?")[0].toUpperCase()}
                  </div>
                )}
                <button
                  onClick={() => setShowAvatarPicker(!showAvatarPicker)}
                  className="avatar-edit-btn"
                  title="Change avatar"
                >
                  +
                </button>
              </div>
              <div className="agent-id-info">
                <div className="agent-name-row">
                  <span className="agent-display-name">{config.displayName}</span>
                  <span className="agent-verified-badge">Verified</span>
                  {selectedAvatarId && (
                    <button
                      onClick={() => setShowStreamingAvatar(!showStreamingAvatar)}
                      className="btn btn-secondary"
                      style={{ fontSize: "0.65rem", padding: "0.1rem 0.4rem", marginLeft: "0.25rem" }}
                    >
                      {showStreamingAvatar ? "Stop Video" : "Live Avatar"}
                    </button>
                  )}
                </div>
                <div className="agent-bio">
                  {config.personaPrompt
                    ? config.personaPrompt.slice(0, 120) + (config.personaPrompt.length > 120 ? "..." : "")
                    : "AI care agent — monitors health, coordinates appointments, and keeps your care team connected."}
                </div>
                <div className="agent-meta-row">
                  <span className={`badge ${config.agentType === "doctor" ? "badge-red" : "badge-blue"}`}>
                    {config.agentType === "doctor" ? "Doctor" : "Patient"}
                  </span>
                  <span className="badge badge-purple">{config.llmProvider}</span>
                  <span className="badge badge-blue">{config.capabilities.length} capabilities</span>
                  {config.googleCalendarTokens && <span className="badge badge-green">Calendar</span>}
                </div>
              </div>
            </div>

            {/* Endpoint */}
            <div className="agent-endpoint">
              <div className="agent-endpoint-label">Care Agent Endpoint</div>
              <div className="agent-endpoint-row">
                <span className="agent-endpoint-url">{config.endpointUrl}</span>
                <button className="agent-copy-btn" onClick={copyEndpoint}>
                  {copied ? "COPIED" : "COPY"}
                </button>
              </div>
              <div className="agent-pubkey">
                {config.publicKey ? <>Public Key: {config.publicKey.slice(0, 32)}...</> : "No public key"}
              </div>
            </div>
          </div>

          <div className="agent-hero-qr">
            <QRCode value={config.endpointUrl} size={140} />
            <div className="agent-qr-label">Scan to connect</div>
          </div>
        </div>

        {/* ── Avatar Picker ── */}
        {showAvatarPicker && (
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <h2 style={{ fontSize: "1rem", margin: 0 }}>Choose Avatar</h2>
              <div className="row" style={{ gap: "0.5rem" }}>
                {selectedAvatarPhoto && (
                  <button className="btn btn-secondary" style={{ fontSize: "0.7rem", padding: "0.2rem 0.5rem", color: "var(--red)" }} onClick={removeAvatar}>
                    Remove
                  </button>
                )}
                <button className="btn btn-secondary" style={{ fontSize: "0.7rem", padding: "0.2rem 0.5rem" }} onClick={() => setShowAvatarPicker(false)}>
                  Close
                </button>
              </div>
            </div>
            <div style={{ display: "flex", gap: "0.375rem", marginBottom: "0.75rem" }}>
              {([
                ["all", "All"],
                ...(customCount > 0 ? [["custom", `My Avatars (${customCount})`]] : []),
                ["female", "Female"],
                ["male", "Male"],
              ] as [AvatarFilter, string][]).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setAvatarFilter(key)}
                  className={`agent-filter-tab ${avatarFilter === key ? "active" : ""}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {!avatarsLoaded ? (
              <div style={{ padding: "1.5rem", textAlign: "center" }}>
                <span className="spinner" />
              </div>
            ) : sortedAvatars.length === 0 ? (
              <div style={{ padding: "1rem", textAlign: "center", color: "var(--text-dim)", fontSize: "0.8rem" }}>
                {avatarFilter === "custom" ? "No custom avatars yet." : "No avatars found."}
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))", gap: "0.5rem", maxHeight: 320, overflowY: "auto" }}>
                {sortedAvatars.map((a) => (
                  <div
                    key={a.avatar_id}
                    onClick={() => selectAvatar(a)}
                    style={{
                      cursor: "pointer", borderRadius: "0.5rem",
                      border: a.avatar_id === selectedAvatarId ? "2px solid var(--accent)" : "2px solid transparent",
                      padding: "0.25rem", textAlign: "center", transition: "transform 0.15s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.05)")}
                    onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
                  >
                    <img src={a.preview_image_url} alt={a.avatar_name} loading="lazy"
                      style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: "0.375rem" }} />
                    <div style={{ fontSize: "0.6rem", color: "var(--text-dim)", marginTop: "0.125rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {a.isCustom ? "* " : ""}{a.avatar_name}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Streaming Avatar ── */}
        {showStreamingAvatar && selectedAvatarId && (
          <div className="card">
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
              <StreamingAvatar
                ref={avatarStreamRef}
                avatarId={selectedAvatarId}
                initialText={`Hi! I'm ${config.displayName}. ${config.personaPrompt ? config.personaPrompt.slice(0, 150) : "How can I help you today?"}`}
              />
              <div style={{ display: "flex", gap: "0.5rem", width: "100%", maxWidth: 400 }}>
                <input
                  placeholder="Type something for the avatar to say..."
                  value={speakText}
                  onChange={(e) => setSpeakText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && speakText.trim()) {
                      avatarStreamRef.current?.speak(speakText.trim());
                      setSpeakText("");
                    }
                  }}
                  style={{ flex: 1 }}
                />
                <button className="btn btn-primary" style={{ fontSize: "0.8rem", padding: "0.375rem 0.75rem" }}
                  onClick={() => { if (speakText.trim()) { avatarStreamRef.current?.speak(speakText.trim()); setSpeakText(""); } }}>
                  Speak
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── STATS ── */}
        <div className="agent-stats">
          <div className="agent-stat">
            <div className="agent-stat-val">{config.capabilities.length}</div>
            <div className="agent-stat-lbl">Active Capabilities</div>
          </div>
          <div className="agent-stat">
            <div className="agent-stat-val">{config.policies.length}</div>
            <div className="agent-stat-lbl">Policies Configured</div>
          </div>
          <div className="agent-stat">
            <div className="agent-stat-val">{alerts.length}</div>
            <div className="agent-stat-lbl">Recent Alerts</div>
          </div>
          <div className="agent-stat">
            <div className="agent-stat-val">
              {config.policies.reduce((acc, p) => {
                const callers = JSON.parse(p.allowedCallersJson);
                return callers.includes("*") ? acc : acc + callers.length;
              }, 0) || "All"}
            </div>
            <div className="agent-stat-lbl">Trusted Agents</div>
          </div>
        </div>

        {/* ── CAPABILITIES: Two-column layout ── */}
        <div className="agent-section-header">
          <span className="agent-section-title">Capabilities</span>
          <div className="agent-section-line" />
          <span className="agent-section-count">{enabledCaps.size} of {ALL_CAPABILITIES.length} active</span>
        </div>

        <div className="agent-cap-grid">
          {/* Personal capabilities */}
          <div className="agent-cap-col">
            <div className="agent-col-title">How This Agent Cares For You</div>
            <div className="agent-col-sub">Services this agent provides for your patient</div>
            {PERSONAL_CAPABILITIES.map((cap) => {
              const enabled = enabledCaps.has(cap.name);
              const policy = getPolicy(cap.name);
              return (
                <div key={cap.name} className={`agent-cap-card ${enabled ? "" : "disabled"}`}>
                  <div className="agent-cap-top">
                    <div className="agent-cap-left">
                      <div className="agent-cap-icon">{cap.icon}</div>
                      <div>
                        <div className="agent-cap-name">{cap.name}</div>
                        <div className="agent-cap-status">
                          <span className={`agent-dot ${enabled ? "on" : ""}`} />
                          {enabled ? "Enabled" : "Disabled"}
                        </div>
                      </div>
                    </div>
                    <label className="agent-switch">
                      <input type="checkbox" checked={enabled} onChange={() => toggleCap(cap.name)} />
                      <span className="agent-switch-slider" />
                    </label>
                  </div>
                  <div className="agent-cap-details">
                    <div className="agent-cap-row">
                      <span className="agent-cap-label">Does:</span>
                      <span className="agent-cap-value">{cap.description}</span>
                    </div>
                    {enabled && policy && (
                      <div className="agent-cap-row">
                        <span className="agent-cap-label">Access:</span>
                        <span className="agent-cap-value">{formatPolicyCallers(policy)}</span>
                      </div>
                    )}
                    {enabled && (
                      <div style={{ marginTop: "0.5rem" }}>
                        <button className="agent-config-btn" onClick={() => startEditPolicy(cap.name)}>
                          Edit Policy
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Public capabilities */}
          <div className="agent-cap-col">
            <div className="agent-col-title">What You Share With Other Care Providers</div>
            <div className="agent-col-sub">Data and services accessible to your care network</div>
            {PUBLIC_CAPABILITIES.map((cap) => {
              const enabled = enabledCaps.has(cap.name);
              const policy = getPolicy(cap.name);
              return (
                <div key={cap.name} className={`agent-cap-card ${enabled ? "" : "disabled"}`}>
                  <div className="agent-cap-top">
                    <div className="agent-cap-left">
                      <div className="agent-cap-icon">{cap.icon}</div>
                      <div>
                        <div className="agent-cap-name">{cap.name}</div>
                        <div className="agent-cap-status">
                          <span className={`agent-dot ${enabled ? "on" : ""}`} />
                          {enabled ? "Enabled" : "Disabled"}
                        </div>
                      </div>
                    </div>
                    <label className="agent-switch">
                      <input type="checkbox" checked={enabled} onChange={() => toggleCap(cap.name)} />
                      <span className="agent-switch-slider" />
                    </label>
                  </div>
                  <div className="agent-cap-details">
                    <div className="agent-cap-row">
                      <span className="agent-cap-label">Offers:</span>
                      <span className="agent-cap-value">{cap.description}</span>
                    </div>
                    {enabled && policy && (
                      <>
                        <div className="agent-cap-row">
                          <span className="agent-cap-label">Access:</span>
                          <span className="agent-cap-value">{formatPolicyCallers(policy)}</span>
                        </div>
                        {policy.paymentRequired && (
                          <div className="agent-cap-row">
                            <span className="agent-cap-label">Price:</span>
                            <span className="agent-cap-value">${(policy.priceCents / 100).toFixed(2)}/request</span>
                          </div>
                        )}
                      </>
                    )}
                    {enabled && (
                      <div style={{ marginTop: "0.5rem" }}>
                        <button className="agent-config-btn" onClick={() => startEditPolicy(cap.name)}>
                          Edit Policy
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Placeholder for future public capabilities */}
            <div className="agent-cap-card disabled" style={{ borderStyle: "dashed", opacity: 0.4 }}>
              <div className="agent-cap-top">
                <div className="agent-cap-left">
                  <div className="agent-cap-icon">📅</div>
                  <div>
                    <div className="agent-cap-name">Accept Appointment Requests</div>
                    <div className="agent-cap-status" style={{ fontStyle: "italic" }}>Coming soon</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="agent-cap-card disabled" style={{ borderStyle: "dashed", opacity: 0.4 }}>
              <div className="agent-cap-top">
                <div className="agent-cap-left">
                  <div className="agent-cap-icon">📄</div>
                  <div>
                    <div className="agent-cap-name">Share Documents</div>
                    <div className="agent-cap-status" style={{ fontStyle: "italic" }}>Coming soon</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Policy Editor Modal ── */}
        {editingPolicy && (
          <div className="card" style={{ borderColor: "var(--accent)" }}>
            <h2 style={{ fontSize: "1rem", marginBottom: "0.75rem" }}>Policy: {editingPolicy}</h2>
            <div className="field" style={{ marginBottom: "0.75rem" }}>
              <label>Allowed Callers (comma-separated, * for all)</label>
              <input value={policyCallers} onChange={(e) => setPolicyCallers(e.target.value)} />
            </div>
            <div className="field" style={{ marginBottom: "0.75rem" }}>
              <label>Required Scopes (comma-separated)</label>
              <input value={policyScopes} onChange={(e) => setPolicyScopes(e.target.value)} />
            </div>
            <div className="row" style={{ marginBottom: "0.75rem", gap: "1.5rem" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontSize: "0.8125rem", cursor: "pointer" }}>
                <input type="checkbox" checked={policyPayment} onChange={(e) => setPolicyPayment(e.target.checked)} style={{ accentColor: "var(--accent)" }} />
                Payment Required
              </label>
              {policyPayment && (
                <div className="field">
                  <label>Price (cents)</label>
                  <input type="number" value={policyPrice} onChange={(e) => setPolicyPrice(Number(e.target.value))} style={{ width: 100 }} />
                </div>
              )}
            </div>
            <div className="row">
              <button className="btn btn-primary" onClick={savePolicy}>Save Policy</button>
              <button className="btn btn-secondary" onClick={() => setEditingPolicy(null)}>Cancel</button>
            </div>
          </div>
        )}

        {/* ── PERMISSION SCOPES ── */}
        <div className="agent-section-header">
          <span className="agent-section-title">Permission Scopes</span>
          <div className="agent-section-line" />
        </div>

        <div className="agent-perm-grid">
          <div className="agent-perm-card">
            <div className="agent-perm-tier">Public</div>
            <div className="agent-perm-sub">Any agent on the network</div>
            <div className="agent-perm-list">
              <div className="agent-perm-item">View public profile</div>
              <div className="agent-perm-item">Discover capabilities</div>
              <div className="agent-perm-item">Send messages</div>
              <div className="agent-perm-item">Initiate handshake</div>
            </div>
            <div className="agent-perm-count">
              <span className="agent-perm-count-lbl">Agents at tier</span>
              <span className="agent-perm-count-val">
                {config.policies.filter((p) => JSON.parse(p.allowedCallersJson).includes("*")).length > 0 ? "All" : "0"}
              </span>
            </div>
          </div>
          <div className="agent-perm-card">
            <div className="agent-perm-tier">Trusted</div>
            <div className="agent-perm-sub">Verified agents with scoped access</div>
            <div className="agent-perm-list">
              <div className="agent-perm-item">Invoke capabilities</div>
              <div className="agent-perm-item">View health data</div>
              <div className="agent-perm-item">Schedule meetings</div>
              <div className="agent-perm-item">Initiate negotiations</div>
            </div>
            <div className="agent-perm-count">
              <span className="agent-perm-count-lbl">Agents at tier</span>
              <span className="agent-perm-count-val">
                {new Set(config.policies.flatMap((p) => {
                  const c = JSON.parse(p.allowedCallersJson);
                  return c.includes("*") ? [] : c;
                })).size || "0"}
              </span>
            </div>
          </div>
          <div className="agent-perm-card">
            <div className="agent-perm-tier">Inner Circle</div>
            <div className="agent-perm-sub">Full access, manually approved</div>
            <div className="agent-perm-list">
              <div className="agent-perm-item">Full record access</div>
              <div className="agent-perm-item">Make transactions</div>
              <div className="agent-perm-item">Sign contracts</div>
              <div className="agent-perm-item">Access financial data</div>
            </div>
            <div className="agent-perm-count">
              <span className="agent-perm-count-lbl">Agents at tier</span>
              <span className="agent-perm-count-val">0</span>
            </div>
          </div>
        </div>

        {/* ── RECENT ACTIVITY ── */}
        {alerts.length > 0 && (
          <>
            <div className="agent-section-header">
              <span className="agent-section-title">Recent Activity</span>
              <div className="agent-section-line" />
            </div>
            <div className="agent-feed">
              {alerts.map((alert) => {
                const decision = JSON.parse(alert.decisionJson || "{}");
                const flags = JSON.parse(alert.flagsJson || "[]");
                return (
                  <div key={alert.id} className="agent-feed-item">
                    <div className="agent-feed-icon">
                      {alert.severity === "urgent" ? "🔴" : alert.severity === "soon" ? "🟡" : "🟢"}
                    </div>
                    <div className="agent-feed-body">
                      <div className="agent-feed-txt">
                        {decision.explanation || `${alert.severity} anomaly detected`}
                      </div>
                      <div className="agent-feed-detail">
                        <span className={`badge badge-${alert.severity === "urgent" ? "red" : alert.severity === "soon" ? "yellow" : "green"}`}>
                          {alert.severity}
                        </span>
                        <span className={`badge badge-${alert.status === "active" ? "blue" : "green"}`} style={{ marginLeft: "0.25rem" }}>
                          {alert.status}
                        </span>
                        {flags.map((f: string) => (
                          <span key={f} className="badge badge-orange" style={{ marginLeft: "0.25rem" }}>{f}</span>
                        ))}
                      </div>
                    </div>
                    <div className="agent-feed-time">{timeAgo(alert.createdAt)}</div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ── SETTINGS (collapsible) ── */}
        <div className="agent-section-header" style={{ cursor: "pointer" }} onClick={() => setShowSettings(!showSettings)}>
          <span className="agent-section-title">Settings</span>
          <div className="agent-section-line" />
          <span style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>{showSettings ? "▲ Collapse" : "▼ Expand"}</span>
        </div>

        {showSettings && (
          <>
            {/* LLM Provider */}
            <div className="card">
              <h2 style={{ fontSize: "1rem", marginBottom: "0.75rem" }}>LLM Provider</h2>
              <ProviderToggle value={provider} onChange={setProvider} />
            </div>

            {/* Persona */}
            <div className="card">
              <h2 style={{ fontSize: "1rem", marginBottom: "0.75rem" }}>Persona Prompt</h2>
              <textarea
                className="persona-textarea"
                placeholder="Custom persona prompt for this agent..."
                value={persona}
                onChange={(e) => setPersona(e.target.value)}
                rows={4}
              />
            </div>

            {/* Anomaly Thresholds */}
            <div className="card">
              <h2 style={{ fontSize: "1rem", marginBottom: "0.75rem" }}>Anomaly Thresholds</h2>
              <div className="threshold-row">
                <div className="field" style={{ flex: 1 }}>
                  <label>Urgent Threshold: {urgentThreshold}</label>
                  <input type="range" min={50} max={100} value={urgentThreshold}
                    onChange={(e) => setUrgentThreshold(Number(e.target.value))}
                    style={{ width: "100%", accentColor: "var(--red)" }} />
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label>Soon Threshold: {soonThreshold}</label>
                  <input type="range" min={30} max={90} value={soonThreshold}
                    onChange={(e) => setSoonThreshold(Number(e.target.value))}
                    style={{ width: "100%", accentColor: "var(--yellow)" }} />
                </div>
              </div>
            </div>

            {/* Agent Type */}
            <div className="card">
              <h2 style={{ fontSize: "1rem", marginBottom: "0.75rem" }}>Agent Type</h2>
              <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
                <button
                  className={`btn ${agentType === "patient" ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => setAgentType("patient")}
                  style={{ flex: 1 }}
                >
                  Patient
                </button>
                <button
                  className={`btn ${agentType === "doctor" ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => setAgentType("doctor")}
                  style={{ flex: 1 }}
                >
                  Doctor
                </button>
              </div>
              {agentType === "doctor" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  <div className="field">
                    <label>Specialty</label>
                    <input
                      placeholder="e.g. Internal Medicine, Cardiology..."
                      value={specialty}
                      onChange={(e) => setSpecialty(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label>Clinic Name</label>
                    <input
                      placeholder="e.g. TreeHacks Health Clinic"
                      value={clinicName}
                      onChange={(e) => setClinicName(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label>Doctor Calendar Email</label>
                    <input
                      type="email"
                      placeholder="doctor@gmail.com (for service account calendar access)"
                      value={doctorCalendarEmail}
                      onChange={(e) => setDoctorCalendarEmail(e.target.value)}
                    />
                    <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", marginTop: "0.25rem" }}>
                      The Google account email whose calendar the Doctor Agent writes to via service account.
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Google Calendar */}
            <div className="card">
              <h2 style={{ fontSize: "1rem", marginBottom: "0.75rem" }}>Google Calendar</h2>
              {config.googleCalendarTokens ? (
                <div className="row">
                  <span className="badge badge-green">Connected</span>
                  <button className="btn btn-secondary" onClick={() => window.location.href = `/api/google/connect?handle=${handle}`}>
                    Reconnect
                  </button>
                </div>
              ) : (
                <button className="btn btn-primary" onClick={() => window.location.href = `/api/google/connect?handle=${handle}`}>
                  Connect Google Calendar
                </button>
              )}
            </div>
          </>
        )}

        {/* ── SAVE BAR ── */}
        <div className="agent-save-bar">
          {saveMsg && (
            <span style={{ fontSize: "0.8125rem", color: saveMsg.includes("Error") ? "var(--red)" : "var(--green)" }}>
              {saveMsg}
            </span>
          )}
          <button className="btn btn-primary" onClick={saveConfig} disabled={saving}>
            {saving ? <><span className="spinner" /> Saving...</> : "Save Configuration"}
          </button>
        </div>

        {/* ── FOOTER ── */}
        <div className="agent-footer">
          {config.endpointUrl} &middot; CareSync v2.4.1
        </div>

      </div>
    </>
  );
}
