"use client";

import { useState } from "react";
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

interface HealthResult {
  traceId: string;
  healthSummary: {
    rangeDays: number;
    sleep: { avg: number; trend: string; flags: string[] };
    activity: { avgSteps: number; trend: string };
    medication: { adherencePct: number; missedDays: number };
    symptoms: { avgScore: number; spikes: string[] };
    notes: string[];
    patientFriendlyText?: string;
  };
  provider: string;
}

interface PaymentError {
  error: string;
  checkoutUrl: string;
  priceCents: number;
  traceId: string;
}

export default function Home() {
  // Scheduling state
  const [schedFrom, setSchedFrom] = useState("pari");
  const [schedTo, setSchedTo] = useState("alex");
  const [schedProvider, setSchedProvider] = useState<Provider>("claude");
  const [schedLoading, setSchedLoading] = useState(false);
  const [schedResult, setSchedResult] = useState<ScheduleResult | null>(null);
  const [schedTrace, setSchedTrace] = useState<TraceStep[]>([]);
  const [schedError, setSchedError] = useState<string | null>(null);

  // Health state
  const [healthProvider, setHealthProvider] = useState<Provider>("claude");
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthResult, setHealthResult] = useState<HealthResult | null>(null);
  const [healthTrace, setHealthTrace] = useState<TraceStep[]>([]);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [paymentGate, setPaymentGate] = useState<PaymentError | null>(null);
  const [premiumScope, setPremiumScope] = useState(true);

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
    setPaymentGate(null);

    try {
      const res = await fetch(
        `/api/demo/health?doctor=dr_smith&patient=pari&provider=${healthProvider}&premium=${premiumScope}`
      );

      const data = await res.json();

      if (res.status === 402) {
        setPaymentGate(data as PaymentError);
        if (data.traceId) {
          const traceRes = await fetch(`/api/demo/trace/${data.traceId}`);
          const traceData = await traceRes.json();
          setHealthTrace(traceData.steps || []);
        }
        return;
      }

      if (!res.ok) {
        setHealthError(data.error || "Request failed");
        if (data.traceId) {
          const traceRes = await fetch(`/api/demo/trace/${data.traceId}`);
          const traceData = await traceRes.json();
          setHealthTrace(traceData.steps || []);
        }
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

  return (
    <div className="container">
      <h1>People API</h1>
      <p className="subtitle">
        Agent-to-Agent Human Endpoints &mdash; each person has a canonical
        endpoint (/u/:handle) with scope-based permissions and signed requests.
      </p>

      {/* ── Section A: Scheduling Demo ── */}
      <div className="card">
        <div className="section-header">
          <h2>Multi-turn Scheduling Negotiation</h2>
          <ProviderToggle value={schedProvider} onChange={setSchedProvider} />
        </div>

        <div className="row" style={{ marginBottom: "1rem" }}>
          <div className="field">
            <label>From</label>
            <input
              value={schedFrom}
              onChange={(e) => setSchedFrom(e.target.value)}
            />
          </div>
          <div className="field">
            <label>To</label>
            <input
              value={schedTo}
              onChange={(e) => setSchedTo(e.target.value)}
            />
          </div>
          <button
            className="btn btn-primary"
            onClick={runScheduleDemo}
            disabled={schedLoading}
          >
            {schedLoading ? (
              <>
                <span className="spinner" /> Negotiating...
              </>
            ) : (
              "I want coffee with Alex next week"
            )}
          </button>
        </div>

        {schedError && (
          <div style={{ color: "var(--red)", marginBottom: "1rem", fontSize: "0.875rem" }}>
            Error: {schedError}
          </div>
        )}

        {schedResult && (
          <div style={{ marginBottom: "1rem" }}>
            <div className="row" style={{ marginBottom: "0.75rem" }}>
              <span className="badge badge-green">BOOKED</span>
              <span className="badge badge-orange">{schedResult.provider}</span>
              <span style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>
                Booking {schedResult.bookingId.slice(0, 8)}...
              </span>
            </div>
            <div style={{ fontSize: "0.85rem", color: "var(--text)" }}>
              <strong>Slot:</strong>{" "}
              {new Date(schedResult.chosenSlot.start).toLocaleString()} &mdash;{" "}
              {new Date(schedResult.chosenSlot.end).toLocaleTimeString()}
            </div>
            {schedResult.messages.length > 0 && (
              <div style={{ marginTop: "0.75rem" }}>
                <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginBottom: "0.25rem" }}>
                  NEGOTIATION MESSAGES
                </div>
                {schedResult.messages.map((m, i) => (
                  <div
                    key={i}
                    style={{
                      fontSize: "0.8125rem",
                      padding: "0.375rem 0.5rem",
                      background: "var(--bg)",
                      borderRadius: 4,
                      marginBottom: 4,
                    }}
                  >
                    Turn {i}: {m}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {schedTrace.length > 0 && (
          <>
            <div className="divider" />
            <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginBottom: "0.5rem" }}>
              TRACE ({schedTrace.length} steps)
            </div>
            <TraceViewer steps={schedTrace} provider={schedProvider} />
          </>
        )}
      </div>

      {/* ── Section B: Healthcare Demo ── */}
      <div className="card">
        <div className="section-header">
          <h2>Healthcare Summary</h2>
          <ProviderToggle value={healthProvider} onChange={setHealthProvider} />
        </div>

        <div className="row" style={{ marginBottom: "1rem" }}>
          <button
            className="btn btn-primary"
            onClick={runHealthDemo}
            disabled={healthLoading}
          >
            {healthLoading ? (
              <>
                <span className="spinner" /> Fetching...
              </>
            ) : (
              "Doctor agent: fetch Pari health summary"
            )}
          </button>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.375rem",
              fontSize: "0.8125rem",
              cursor: "pointer",
              color: "var(--text-dim)",
            }}
          >
            <input
              type="checkbox"
              checked={premiumScope}
              onChange={(e) => setPremiumScope(e.target.checked)}
              style={{ accentColor: "var(--accent)" }}
            />
            Premium scope (uncheck to trigger 402)
          </label>
        </div>

        {healthError && (
          <div style={{ color: "var(--red)", marginBottom: "1rem", fontSize: "0.875rem" }}>
            Error: {healthError}
          </div>
        )}

        {paymentGate && (
          <div className="payment-banner" style={{ marginBottom: "1rem" }}>
            <span className="badge badge-yellow">402</span>
            <div style={{ fontSize: "0.85rem" }}>
              <strong>Payment required</strong> &mdash; ${(paymentGate.priceCents / 100).toFixed(2)}
              <br />
              <a
                href={paymentGate.checkoutUrl}
                target="_blank"
                rel="noreferrer"
                style={{ color: "var(--accent)", fontSize: "0.8rem" }}
              >
                Open checkout &rarr;
              </a>
            </div>
          </div>
        )}

        {healthResult && (
          <div style={{ marginBottom: "1rem" }}>
            <div className="row" style={{ marginBottom: "0.75rem" }}>
              <span className="badge badge-green">OK</span>
              <span className="badge badge-orange">{healthResult.provider}</span>
              <span style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>
                {healthResult.healthSummary.rangeDays}-day summary
              </span>
            </div>

            {healthResult.healthSummary.patientFriendlyText && (
              <div className="friendly-text">
                {healthResult.healthSummary.patientFriendlyText}
              </div>
            )}

            <div style={{ marginTop: "1rem" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginBottom: "0.25rem" }}>
                RAW ANALYTICS
              </div>
              <JsonView data={healthResult.healthSummary} maxHeight={300} />
            </div>
          </div>
        )}

        {healthTrace.length > 0 && (
          <>
            <div className="divider" />
            <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginBottom: "0.5rem" }}>
              TRACE ({healthTrace.length} steps)
            </div>
            <TraceViewer steps={healthTrace} provider={healthProvider} />
          </>
        )}
      </div>

      {/* Footer */}
      <div style={{ textAlign: "center", padding: "1rem 0", color: "var(--text-dim)", fontSize: "0.75rem" }}>
        People API &mdash; TreeHacks 2026
      </div>
    </div>
  );
}
