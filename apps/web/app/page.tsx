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

interface AnomalyResult {
  traceId: string;
  severity: string;
  provider: string;
  decision: {
    summary_explanation: string;
    questions: string[];
    recommended_next_step: string;
    should_contact_clinic: boolean;
    urgency: string;
    clinic_message?: string;
  };
  triage_outcome?: {
    intake_questions_asked: string[];
    intake_answers: Record<string, string>;
    urgency: string;
    proposed_slots: { start: string; end: string }[];
    booking_confirmation: { start: string; end: string; method: string };
    escalation_triggered: boolean;
  };
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

  // Anomaly state
  const [anomProvider, setAnomProvider] = useState<Provider>("claude");
  const [anomSeverity, setAnomSeverity] = useState<"mild" | "severe">("severe");
  const [anomLoading, setAnomLoading] = useState(false);
  const [anomResult, setAnomResult] = useState<AnomalyResult | null>(null);
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

  async function runAnomalyDemo() {
    setAnomLoading(true);
    setAnomResult(null);
    setAnomTrace([]);
    setAnomError(null);

    try {
      const res = await fetch(
        `/api/demo/anomaly?severity=${anomSeverity}&provider=${anomProvider}`
      );

      const data = await res.json();

      if (!res.ok) {
        setAnomError(data.error || "Request failed");
        if (data.traceId) {
          const traceRes = await fetch(`/api/demo/trace/${data.traceId}`);
          const traceData = await traceRes.json();
          setAnomTrace(traceData.steps || []);
        }
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

      {/* ── Section C: Health Anomaly → Doctor Receptionist ── */}
      <div className="card">
        <div className="section-header">
          <h2>Health Anomaly &rarr; Doctor Receptionist</h2>
          <ProviderToggle value={anomProvider} onChange={setAnomProvider} />
        </div>

        <div className="row" style={{ marginBottom: "1rem" }}>
          <div className="field">
            <label>Severity</label>
            <select
              value={anomSeverity}
              onChange={(e) => setAnomSeverity(e.target.value as "mild" | "severe")}
            >
              <option value="severe">Severe (score 92)</option>
              <option value="mild">Mild (score 55)</option>
            </select>
          </div>
          <button
            className="btn btn-primary"
            onClick={runAnomalyDemo}
            disabled={anomLoading}
          >
            {anomLoading ? (
              <>
                <span className="spinner" /> Processing...
              </>
            ) : (
              "Simulate wearable anomaly alert"
            )}
          </button>
        </div>

        {anomError && (
          <div style={{ color: "var(--red)", marginBottom: "1rem", fontSize: "0.875rem" }}>
            Error: {anomError}
          </div>
        )}

        {anomResult && (
          <div style={{ marginBottom: "1rem" }}>
            {/* Decision summary */}
            <div className="row" style={{ marginBottom: "0.75rem" }}>
              <span className={`badge ${anomResult.decision.urgency === "urgent" ? "badge-red" : anomResult.decision.urgency === "soon" ? "badge-yellow" : "badge-green"}`}>
                {anomResult.decision.urgency.toUpperCase()}
              </span>
              <span className="badge badge-orange">{anomResult.provider}</span>
              {anomResult.decision.should_contact_clinic && (
                <span className="badge badge-red">ESCALATED</span>
              )}
            </div>

            <div className="friendly-text" style={{ marginBottom: "1rem" }}>
              {anomResult.decision.summary_explanation}
            </div>

            <div style={{ fontSize: "0.8125rem", marginBottom: "0.5rem" }}>
              <strong>Recommended:</strong> {anomResult.decision.recommended_next_step}
            </div>

            {anomResult.decision.questions.length > 0 && (
              <div style={{ marginBottom: "0.75rem" }}>
                <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginBottom: "0.25rem" }}>
                  FOLLOW-UP QUESTIONS
                </div>
                {anomResult.decision.questions.map((q, i) => (
                  <div key={i} style={{ fontSize: "0.8125rem", padding: "0.25rem 0", color: "var(--text)" }}>
                    {i + 1}. {q}
                  </div>
                ))}
              </div>
            )}

            {/* Triage outcome */}
            {anomResult.triage_outcome && (
              <>
                <div className="divider" />
                <div style={{ marginBottom: "0.75rem" }}>
                  <div className="row" style={{ marginBottom: "0.5rem" }}>
                    <h2 style={{ margin: 0, fontSize: "1rem" }}>Doctor Receptionist Outcome</h2>
                    {anomResult.triage_outcome.escalation_triggered && (
                      <span className="badge badge-red" style={{ fontSize: "0.7rem" }}>
                        ESCALATION TRIGGERED
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginBottom: "0.25rem" }}>
                    INTAKE Q&amp;A
                  </div>
                  {anomResult.triage_outcome.intake_questions_asked.map((q, i) => (
                    <div key={i} style={{ fontSize: "0.8125rem", padding: "0.25rem 0.5rem", background: "var(--bg)", borderRadius: 4, marginBottom: 4 }}>
                      <strong>Q:</strong> {q}<br />
                      <strong>A:</strong> {Object.values(anomResult.triage_outcome!.intake_answers)[i] || "—"}
                    </div>
                  ))}

                  <div style={{ marginTop: "0.75rem", fontSize: "0.85rem" }}>
                    <strong>Appointment booked:</strong>{" "}
                    {new Date(anomResult.triage_outcome.booking_confirmation.start).toLocaleString()}{" "}
                    ({anomResult.triage_outcome.booking_confirmation.method})
                  </div>
                </div>
              </>
            )}

            <div style={{ marginTop: "0.5rem" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginBottom: "0.25rem" }}>
                RAW RESPONSE
              </div>
              <JsonView data={anomResult} maxHeight={250} />
            </div>
          </div>
        )}

        {anomTrace.length > 0 && (
          <>
            <div className="divider" />
            <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginBottom: "0.5rem" }}>
              TRACE ({anomTrace.length} steps)
            </div>
            <TraceViewer steps={anomTrace} provider={anomProvider} />
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
