"use client";

import { useState } from "react";
import TopBar from "@/components/TopBar";
import TraceViewer from "@/components/TraceViewer";
import ProviderToggle from "@/components/ProviderToggle";
import JsonView from "@/components/JsonView";
import type { TraceStep } from "@people/shared";

type Provider = "openai" | "claude";

interface ScheduleResult {
  traceId: string;
  bookingId: string;
  provider: string;
  messages: string[];
  chosenSlot: { start: string; end: string };
}

interface SecretaryResult {
  traceId: string;
  finalDecision: string;
  toolCallLog: { tool: string; args: Record<string, unknown>; result: Record<string, unknown> }[];
  provider: string;
  turns: number;
}

export default function DemoPage() {
  // Scheduling state
  const [schedFrom, setSchedFrom] = useState("pari");
  const [schedTo, setSchedTo] = useState("alex");
  const [schedProvider, setSchedProvider] = useState<Provider>("claude");
  const [schedLoading, setSchedLoading] = useState(false);
  const [schedResult, setSchedResult] = useState<ScheduleResult | null>(null);
  const [schedTrace, setSchedTrace] = useState<TraceStep[]>([]);
  const [schedError, setSchedError] = useState<string | null>(null);

  // Health state
  const [healthProvider, setHealthProvider] = useState<Provider>("openai");
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthResult, setHealthResult] = useState<SecretaryResult | null>(null);
  const [healthTrace, setHealthTrace] = useState<TraceStep[]>([]);
  const [healthError, setHealthError] = useState<string | null>(null);

  // Anomaly state
  const [anomProvider, setAnomProvider] = useState<Provider>("openai");
  const [anomSeverity, setAnomSeverity] = useState<"mild" | "severe">("severe");
  const [anomLoading, setAnomLoading] = useState(false);
  const [anomResult, setAnomResult] = useState<SecretaryResult | null>(null);
  const [anomTrace, setAnomTrace] = useState<TraceStep[]>([]);
  const [anomError, setAnomError] = useState<string | null>(null);

  async function runScheduleDemo() {
    setSchedLoading(true);
    setSchedResult(null);
    setSchedTrace([]);
    setSchedError(null);
    try {
      const res = await fetch(
        `/api/demo/schedule?from=${schedFrom}&to=${schedTo}&provider=${schedProvider}`,
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok) {
        setSchedError(data.error || "Request failed");
        if (data.traceId) {
          const traceRes = await fetch(`/api/demo/trace/${data.traceId}`);
          const traceData = await traceRes.json();
          setSchedTrace(traceData.steps || []);
        }
        return;
      }
      setSchedResult(data);
      if (data.traceId) {
        const traceRes = await fetch(`/api/demo/trace/${data.traceId}`);
        const traceData = await traceRes.json();
        setSchedTrace(traceData.steps || []);
      }
    } catch (err) {
      setSchedError(String(err));
    } finally {
      setSchedLoading(false);
    }
  }

  async function runHealthDemo() {
    setHealthLoading(true);
    setHealthResult(null);
    setHealthTrace([]);
    setHealthError(null);
    try {
      const res = await fetch("/api/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trigger_type: "health_summary",
          provider: healthProvider,
          description: "Doctor requests Pari's 30-day health summary",
          data: {
            request_type: "health_summary",
            patient_handle: "pari",
            requested_by: "dr_smith",
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setHealthError(data.error || "Request failed");
        return;
      }
      setHealthResult(data);
      if (data.traceId) {
        const traceRes = await fetch(`/api/demo/trace/${data.traceId}`);
        const traceData = await traceRes.json();
        setHealthTrace(traceData.steps || []);
      }
    } catch (err) {
      setHealthError(String(err));
    } finally {
      setHealthLoading(false);
    }
  }

  async function runAnomalyDemo() {
    setAnomLoading(true);
    setAnomResult(null);
    setAnomTrace([]);
    setAnomError(null);

    const today = new Date().toISOString().split("T")[0];
    const anomalyData =
      anomSeverity === "severe"
        ? {
            user_handle: "pari",
            date: today,
            baseline_window_days: 28,
            metrics: { sleep_hours: 4.2, resting_hr_bpm: 88, steps: 2100, hrv_ms: 22 },
            baseline: { sleep_mean: 7.1, sleep_std: 0.6, rhr_mean: 62, rhr_std: 3, steps_mean: 7500, steps_std: 1200 },
            flags: ["SLEEP_DROP", "RHR_SPIKE", "STEPS_DROP", "HRV_DROP"],
            anomaly_score: 92,
            freeform_context: "Feeling very tired and heart racing since yesterday.",
          }
        : {
            user_handle: "pari",
            date: today,
            baseline_window_days: 28,
            metrics: { sleep_hours: 5.8, resting_hr_bpm: 68, steps: 5200 },
            baseline: { sleep_mean: 7.1, sleep_std: 0.6, rhr_mean: 62, rhr_std: 3, steps_mean: 7500, steps_std: 1200 },
            flags: ["SLEEP_DROP"],
            anomaly_score: 55,
          };

    try {
      const res = await fetch("/api/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trigger_type: "health_anomaly",
          provider: anomProvider,
          description: `Wearable anomaly alert for pari (${anomSeverity}, score ${anomalyData.anomaly_score})`,
          data: anomalyData,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAnomError(data.error || "Request failed");
        return;
      }
      setAnomResult(data);
      if (data.traceId) {
        const traceRes = await fetch(`/api/demo/trace/${data.traceId}`);
        const traceData = await traceRes.json();
        setAnomTrace(traceData.steps || []);
      }
    } catch (err) {
      setAnomError(String(err));
    } finally {
      setAnomLoading(false);
    }
  }

  return (
    <>
      <TopBar title="Demo" />
      <div className="dashboard-content">
        {/* Scheduling Demo */}
        <div className="card">
          <div className="section-header">
            <h2>Multi-turn Scheduling Negotiation</h2>
            <ProviderToggle value={schedProvider} onChange={setSchedProvider} />
          </div>
          <div className="row" style={{ marginBottom: "1rem" }}>
            <div className="field">
              <label>From</label>
              <input value={schedFrom} onChange={(e) => setSchedFrom(e.target.value)} />
            </div>
            <div className="field">
              <label>To</label>
              <input value={schedTo} onChange={(e) => setSchedTo(e.target.value)} />
            </div>
            <button className="btn btn-primary" onClick={runScheduleDemo} disabled={schedLoading}>
              {schedLoading ? <><span className="spinner" /> Negotiating...</> : "I want coffee with Alex next week"}
            </button>
          </div>
          {schedError && <div style={{ color: "var(--red)", marginBottom: "1rem", fontSize: "0.875rem" }}>Error: {schedError}</div>}
          {schedResult && (
            <div style={{ marginBottom: "1rem" }}>
              <div className="row" style={{ marginBottom: "0.75rem" }}>
                <span className="badge badge-green">BOOKED</span>
                <span className="badge badge-orange">{schedResult.provider}</span>
                <span style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>Booking {schedResult.bookingId.slice(0, 8)}...</span>
              </div>
              <div style={{ fontSize: "0.85rem" }}>
                <strong>Slot:</strong> {new Date(schedResult.chosenSlot.start).toLocaleString()} &mdash; {new Date(schedResult.chosenSlot.end).toLocaleTimeString()}
              </div>
              {schedResult.messages.length > 0 && (
                <div style={{ marginTop: "0.75rem" }}>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginBottom: "0.25rem" }}>NEGOTIATION MESSAGES</div>
                  {schedResult.messages.map((m, i) => (
                    <div key={i} style={{ fontSize: "0.8125rem", padding: "0.375rem 0.5rem", background: "var(--bg)", borderRadius: 4, marginBottom: 4 }}>Turn {i}: {m}</div>
                  ))}
                </div>
              )}
            </div>
          )}
          {schedTrace.length > 0 && (
            <>
              <div className="divider" />
              <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginBottom: "0.5rem" }}>TRACE ({schedTrace.length} steps)</div>
              <TraceViewer steps={schedTrace} provider={schedProvider} />
            </>
          )}
        </div>

        {/* Healthcare Demo — via Secretary Agent */}
        <div className="card">
          <div className="section-header">
            <h2>Healthcare Summary (Secretary Agent)</h2>
            <ProviderToggle value={healthProvider} onChange={setHealthProvider} />
          </div>
          <div className="row" style={{ marginBottom: "1rem" }}>
            <button className="btn btn-primary" onClick={runHealthDemo} disabled={healthLoading}>
              {healthLoading ? <><span className="spinner" /> Secretary processing...</> : "Secretary: fetch Pari health summary"}
            </button>
          </div>
          {healthError && <div style={{ color: "var(--red)", marginBottom: "1rem", fontSize: "0.875rem" }}>Error: {healthError}</div>}
          {healthResult && (
            <div style={{ marginBottom: "1rem" }}>
              <div className="row" style={{ marginBottom: "0.75rem" }}>
                <span className="badge badge-green">COMPLETE</span>
                <span className="badge badge-orange">{healthResult.provider}</span>
                <span style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>{healthResult.turns} turn(s), {healthResult.toolCallLog.length} tool call(s)</span>
              </div>
              <div className="friendly-text" style={{ marginBottom: "1rem", whiteSpace: "pre-wrap" }}>{healthResult.finalDecision}</div>
              {healthResult.toolCallLog.length > 0 && (
                <div style={{ marginTop: "0.75rem" }}>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginBottom: "0.25rem" }}>TOOL CALLS</div>
                  {healthResult.toolCallLog.map((tc, i) => (
                    <div key={i} style={{ marginBottom: "0.5rem" }}>
                      <div style={{ fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                        {i + 1}. {tc.tool}
                      </div>
                      <JsonView data={tc.result} maxHeight={200} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {healthTrace.length > 0 && (
            <>
              <div className="divider" />
              <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginBottom: "0.5rem" }}>TRACE ({healthTrace.length} steps)</div>
              <TraceViewer steps={healthTrace} provider={healthProvider} />
            </>
          )}
        </div>

        {/* Anomaly Demo — via Secretary Agent */}
        <div className="card">
          <div className="section-header">
            <h2>Health Anomaly &rarr; Secretary Agent</h2>
            <ProviderToggle value={anomProvider} onChange={setAnomProvider} />
          </div>
          <div className="row" style={{ marginBottom: "1rem" }}>
            <div className="field">
              <label>Severity</label>
              <select value={anomSeverity} onChange={(e) => setAnomSeverity(e.target.value as "mild" | "severe")}>
                <option value="severe">Severe (score 92)</option>
                <option value="mild">Mild (score 55)</option>
              </select>
            </div>
            <button className="btn btn-primary" onClick={runAnomalyDemo} disabled={anomLoading}>
              {anomLoading ? <><span className="spinner" /> Secretary processing...</> : "Simulate wearable anomaly alert"}
            </button>
          </div>
          {anomError && <div style={{ color: "var(--red)", marginBottom: "1rem", fontSize: "0.875rem" }}>Error: {anomError}</div>}
          {anomResult && (
            <div style={{ marginBottom: "1rem" }}>
              <div className="row" style={{ marginBottom: "0.75rem" }}>
                <span className="badge badge-green">COMPLETE</span>
                <span className="badge badge-orange">{anomResult.provider}</span>
                <span style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>
                  {anomResult.turns} turn(s), {anomResult.toolCallLog.length} tool call(s)
                </span>
                {anomResult.toolCallLog.length > 1 && (
                  <span className="badge badge-red">ESCALATED</span>
                )}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginBottom: "0.25rem" }}>SECRETARY DECISION</div>
              <div className="friendly-text" style={{ marginBottom: "1rem", whiteSpace: "pre-wrap" }}>{anomResult.finalDecision}</div>
              {anomResult.toolCallLog.length > 0 && (
                <div style={{ marginTop: "0.75rem" }}>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginBottom: "0.5rem" }}>TOOL CALL LOG</div>
                  {anomResult.toolCallLog.map((tc, i) => (
                    <div key={i} style={{ marginBottom: "0.75rem", padding: "0.5rem", background: "var(--bg)", borderRadius: 6 }}>
                      <div style={{ fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.375rem" }}>
                        {i + 1}. {tc.tool}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginBottom: "0.25rem" }}>Input</div>
                      <JsonView data={tc.args} maxHeight={150} />
                      <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginBottom: "0.25rem", marginTop: "0.375rem" }}>Result</div>
                      <JsonView data={tc.result} maxHeight={200} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {anomTrace.length > 0 && (
            <>
              <div className="divider" />
              <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginBottom: "0.5rem" }}>TRACE ({anomTrace.length} steps)</div>
              <TraceViewer steps={anomTrace} provider={anomProvider} />
            </>
          )}
        </div>
      </div>
    </>
  );
}
