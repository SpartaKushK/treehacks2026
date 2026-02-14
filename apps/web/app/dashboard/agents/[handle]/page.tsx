"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";
import ProviderToggle from "@/components/ProviderToggle";

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
  capabilities: Capability[];
  policies: Policy[];
}

type Provider = "openai" | "claude";

const AVAILABLE_CAPABILITIES = [
  { name: "schedule_propose", description: "Propose meeting times" },
  { name: "schedule_counter", description: "Counter-propose meeting times" },
  { name: "schedule_confirm", description: "Confirm a meeting booking" },
  { name: "health_summary", description: "View health analytics summary" },
  { name: "health.anomaly_alert", description: "Receive and triage health anomaly alerts" },
  { name: "triage.intake_and_schedule", description: "Run intake questions and schedule appointments" },
  { name: "execute_trade", description: "Execute a financial trade" },
];

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

  // Policy editing
  const [editingPolicy, setEditingPolicy] = useState<string | null>(null);
  const [policyCallers, setPolicyCallers] = useState("");
  const [policyScopes, setPolicyScopes] = useState("");
  const [policyPayment, setPolicyPayment] = useState(false);
  const [policyPrice, setPolicyPrice] = useState(0);

  useEffect(() => {
    fetch(`/api/agents/${handle}/config`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setLoading(false);
          return;
        }
        setConfig(data);
        setProvider(data.llmProvider as Provider);
        setPersona(data.personaPrompt || "");
        const thresholds = JSON.parse(data.anomalyThresholdJson || "{}");
        setUrgentThreshold(thresholds.urgent ?? 85);
        setSoonThreshold(thresholds.soon ?? 70);
        setEnabledCaps(new Set(data.capabilities.map((c: Capability) => c.name)));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [handle]);

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
        capabilities: AVAILABLE_CAPABILITIES
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
    // Reload config
    const res = await fetch(`/api/agents/${handle}/config`);
    const data = await res.json();
    setConfig(data);
    setEditingPolicy(null);
  }

  if (loading) {
    return (
      <>
        <TopBar title="Agent Config" />
        <div className="dashboard-content" style={{ textAlign: "center", padding: "3rem" }}>
          <span className="spinner" />
        </div>
      </>
    );
  }

  if (!config) {
    return (
      <>
        <TopBar title="Agent Config" />
        <div className="dashboard-content">
          <div className="card">
            <p style={{ color: "var(--red)" }}>Agent not found or you don&apos;t own this agent.</p>
            <button className="btn btn-secondary" onClick={() => router.push("/dashboard/agents")} style={{ marginTop: "1rem" }}>
              Back to Agents
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar title={`@${config.handle}`} />
      <div className="dashboard-content">
        {/* Identity */}
        <div className="card">
          <h2 style={{ fontSize: "1rem", marginBottom: "0.75rem" }}>Identity</h2>
          <div className="config-grid">
            <div className="config-item">
              <span className="config-label">Handle</span>
              <span className="config-value">@{config.handle}</span>
            </div>
            <div className="config-item">
              <span className="config-label">Display Name</span>
              <span className="config-value">{config.displayName}</span>
            </div>
            <div className="config-item">
              <span className="config-label">Public Key</span>
              <span className="config-value" style={{ fontSize: "0.7rem", wordBreak: "break-all" }}>
                {config.publicKey.slice(0, 32)}...
              </span>
            </div>
            <div className="config-item">
              <span className="config-label">Endpoint</span>
              <span className="config-value" style={{ fontSize: "0.75rem" }}>{config.endpointUrl}</span>
            </div>
          </div>
        </div>

        {/* LLM Provider */}
        <div className="card">
          <h2 style={{ fontSize: "1rem", marginBottom: "0.75rem" }}>LLM Provider</h2>
          <ProviderToggle value={provider} onChange={setProvider} />
        </div>

        {/* Capabilities */}
        <div className="card">
          <h2 style={{ fontSize: "1rem", marginBottom: "0.75rem" }}>Capabilities</h2>
          <div className="cap-list">
            {AVAILABLE_CAPABILITIES.map((cap) => (
              <div key={cap.name} className="cap-row">
                <label className="cap-toggle">
                  <input
                    type="checkbox"
                    checked={enabledCaps.has(cap.name)}
                    onChange={() => toggleCap(cap.name)}
                    style={{ accentColor: "var(--accent)" }}
                  />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "0.875rem" }}>{cap.name}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>{cap.description}</div>
                  </div>
                </label>
                {enabledCaps.has(cap.name) && (
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem" }}
                    onClick={() => startEditPolicy(cap.name)}
                  >
                    Edit Policy
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Policy editor modal */}
        {editingPolicy && (
          <div className="card" style={{ borderColor: "var(--accent)" }}>
            <h2 style={{ fontSize: "1rem", marginBottom: "0.75rem" }}>
              Policy: {editingPolicy}
            </h2>
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

        {/* Persona */}
        <div className="card">
          <h2 style={{ fontSize: "1rem", marginBottom: "0.75rem" }}>Persona Prompt</h2>
          <textarea
            className="persona-textarea"
            placeholder="Custom persona prompt for this agent... Leave empty for default."
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
              <input
                type="range"
                min={50}
                max={100}
                value={urgentThreshold}
                onChange={(e) => setUrgentThreshold(Number(e.target.value))}
                style={{ width: "100%", accentColor: "var(--red)" }}
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>Soon Threshold: {soonThreshold}</label>
              <input
                type="range"
                min={30}
                max={90}
                value={soonThreshold}
                onChange={(e) => setSoonThreshold(Number(e.target.value))}
                style={{ width: "100%", accentColor: "var(--yellow)" }}
              />
            </div>
          </div>
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

        {/* Save */}
        <div className="row" style={{ justifyContent: "flex-end", gap: "0.75rem" }}>
          {saveMsg && (
            <span style={{ fontSize: "0.8125rem", color: saveMsg === "Saved!" ? "var(--green)" : "var(--red)" }}>
              {saveMsg}
            </span>
          )}
          <button className="btn btn-primary" onClick={saveConfig} disabled={saving}>
            {saving ? <><span className="spinner" /> Saving...</> : "Save Configuration"}
          </button>
        </div>
      </div>
    </>
  );
}
