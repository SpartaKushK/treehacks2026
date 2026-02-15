"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";
import TraceViewer from "@/components/TraceViewer";
import JsonView from "@/components/JsonView";
import StatusBadge from "@/components/StatusBadge";
import StreamingAvatar, { type StreamingAvatarHandle } from "@/components/StreamingAvatar";
import type { TraceStep } from "@people/shared";

interface TraceData {
  id: string;
  createdAt: string;
  provider: string;
  steps: TraceStep[];
}

export default function AnomalyDrillDown() {
  const { traceId } = useParams<{ traceId: string }>();
  const router = useRouter();
  const [trace, setTrace] = useState<TraceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [agentAvatarId, setAgentAvatarId] = useState<string | null>(null);
  const [showStreamingAvatar, setShowStreamingAvatar] = useState(false);
  const avatarStreamRef = useRef<StreamingAvatarHandle>(null);

  useEffect(() => {
    fetch(`/api/demo/trace/${traceId}`)
      .then((r) => r.json())
      .then((data) => {
        setTrace(data?.steps ? data : null);
        setLoading(false);
        fetch(`/api/anomaly/history?traceId=${traceId}`)
          .then((r) => r.json())
          .then((alertData) => {
            const alert = (alertData.alerts || [])[0];
            if (alert?.agentAvatarId) {
              setAgentAvatarId(alert.agentAvatarId);
            }
          })
          .catch(() => {});
      })
      .catch(() => setLoading(false));
  }, [traceId]);

  if (loading) {
    return (
      <>
        <TopBar title="Alert Details" />
        <div className="dashboard-content" style={{ textAlign: "center", padding: "3rem" }}>
          <span className="spinner" />
        </div>
      </>
    );
  }

  if (!trace) {
    return (
      <>
        <TopBar title="Alert Details" />
        <div className="dashboard-content">
          <div
            style={{
              textAlign: "center",
              color: "var(--red)",
              fontSize: "0.85rem",
              padding: "2rem",
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "10px",
            }}
          >
            Trace not found.
          </div>
        </div>
      </>
    );
  }

  const decisionStep = trace.steps.find((s) => s.event === "PATIENT_DECISION");
  const triageSteps = trace.steps.filter(
    (s) => s.event === "INTAKE_TURN_1" || s.event === "INTAKE_TURN_2" || s.event === "APPOINTMENT_BOOKED"
  );
  const anomalyStep = trace.steps.find((s) => s.event === "HEALTH_ANOMALY_RECEIVED");

  return (
    <>
      <TopBar title={`Trace: ${traceId.slice(0, 8)}...`} />
      <div className="dashboard-content">
        <button
          className="agent-config-btn"
          onClick={() => router.push("/dashboard/anomaly")}
          style={{ marginBottom: "1.5rem", padding: "0.375rem 0.875rem", fontSize: "0.7rem" }}
        >
          &larr; BACK TO HEALTH ALERTS
        </button>

        {/* Trace hero/metadata */}
        <div className="agent-stats" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          <div className="agent-stat">
            <div className="agent-stat-val" style={{ fontSize: "0.9rem" }}>
              <span className="badge badge-orange" style={{ fontSize: "0.7rem" }}>{trace.provider}</span>
            </div>
            <div className="agent-stat-lbl">Provider</div>
          </div>
          <div className="agent-stat">
            <div className="agent-stat-val">{trace.steps.length}</div>
            <div className="agent-stat-lbl">Trace Steps</div>
          </div>
          <div className="agent-stat">
            <div className="agent-stat-val" style={{ fontSize: "0.85rem", fontFamily: "monospace" }}>
              {new Date(trace.createdAt).toLocaleString()}
            </div>
            <div className="agent-stat-lbl">Timestamp</div>
          </div>
        </div>

        {/* Streaming Avatar for anomaly explanation */}
        {agentAvatarId && (
          <>
            <div className="agent-section-header">
              <span className="agent-section-title">Avatar Explanation</span>
              <span className="agent-section-line" />
            </div>
            {!showStreamingAvatar ? (
              <div style={{ marginBottom: "1.5rem" }}>
                <button className="btn btn-primary" onClick={() => setShowStreamingAvatar(true)}>
                  Have Avatar Explain This Anomaly
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem", marginBottom: "1.5rem" }}>
                <StreamingAvatar
                  ref={avatarStreamRef}
                  avatarId={agentAvatarId}
                  initialText={(() => {
                    const step = trace.steps.find((s) => s.event === "PATIENT_DECISION");
                    const decision = step ? (step.data as Record<string, unknown>)?.decision as Record<string, unknown> | undefined : undefined;
                    return decision?.summary_explanation
                      ? String(decision.summary_explanation)
                      : "I've detected an anomaly in your health data. Let me walk you through what happened.";
                  })()}
                />
                <button
                  className="agent-config-btn"
                  onClick={() => setShowStreamingAvatar(false)}
                >
                  STOP AVATAR
                </button>
              </div>
            )}
          </>
        )}

        {/* Anomaly data */}
        {anomalyStep && (
          <>
            <div className="agent-section-header">
              <span className="agent-section-title">Health Data Snapshot</span>
              <span className="agent-section-line" />
            </div>
            <div style={{ marginBottom: "1.5rem" }}>
              <JsonView data={(anomalyStep.data as Record<string, unknown>)?.anomaly || anomalyStep.data} maxHeight={200} />
            </div>
          </>
        )}

        {/* Decision */}
        {decisionStep && (
          <>
            <div className="agent-section-header">
              <span className="agent-section-title">Care Agent Assessment</span>
              <span className="agent-section-line" />
            </div>
            <div style={{ marginBottom: "1.5rem" }}>
              {(() => {
                const decision = (decisionStep.data as Record<string, unknown>)?.decision as Record<string, unknown> | undefined;
                if (!decision) return <JsonView data={decisionStep.data} maxHeight={200} />;
                return (
                  <div
                    style={{
                      padding: "1.25rem",
                      background: "var(--bg-card)",
                      border: "1px solid var(--border)",
                      borderRadius: "10px",
                    }}
                  >
                    <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
                      <StatusBadge status={(decision.urgency as string) as "urgent" | "soon" | "routine"} />
                      {Boolean(decision.should_contact_clinic) && <span className="badge badge-red">ESCALATED</span>}
                    </div>
                    <div className="friendly-text">{decision.summary_explanation as string}</div>
                    {(decision.questions as string[])?.length > 0 && (
                      <div style={{ marginTop: "1rem" }}>
                        <div style={{ fontSize: "0.65rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-dim)", marginBottom: "0.5rem" }}>
                          Follow-up Questions
                        </div>
                        {(decision.questions as string[]).map((q, i) => (
                          <div key={i} style={{ fontSize: "0.8rem", padding: "0.375rem 0.625rem", background: "var(--bg)", borderRadius: 6, marginBottom: 4 }}>
                            {i + 1}. {q}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </>
        )}

        {/* Triage */}
        {triageSteps.length > 0 && (
          <>
            <div className="agent-section-header">
              <span className="agent-section-title">Triage Outcome</span>
              <span className="agent-section-line" />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1.5rem" }}>
              {triageSteps.map((step, i) => (
                <div
                  key={i}
                  style={{
                    padding: "1rem",
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderRadius: "10px",
                  }}
                >
                  <span className="badge badge-blue" style={{ marginBottom: "0.5rem", display: "inline-block" }}>
                    {step.event}
                  </span>
                  <JsonView data={step.data} maxHeight={150} />
                </div>
              ))}
            </div>
          </>
        )}

        {/* Full trace timeline */}
        <div className="agent-section-header">
          <span className="agent-section-title">Full Activity Log</span>
          <span className="agent-section-line" />
          <span className="agent-section-count">{trace.steps.length} steps</span>
        </div>
        <div
          style={{
            padding: "1.25rem",
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "10px",
          }}
        >
          <TraceViewer steps={trace.steps} provider={trace.provider} />
        </div>

        <div className="agent-footer">CARESYNC — TREEHACKS 2026</div>
      </div>
    </>
  );
}
