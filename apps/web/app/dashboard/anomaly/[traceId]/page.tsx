"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";
import TraceViewer from "@/components/TraceViewer";
import JsonView from "@/components/JsonView";
import StatusBadge from "@/components/StatusBadge";
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

  useEffect(() => {
    fetch(`/api/demo/trace/${traceId}`)
      .then((r) => r.json())
      .then((data) => {
        setTrace(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [traceId]);

  if (loading) {
    return (
      <>
        <TopBar title="Trace Details" />
        <div className="dashboard-content" style={{ textAlign: "center", padding: "3rem" }}>
          <span className="spinner" />
        </div>
      </>
    );
  }

  if (!trace) {
    return (
      <>
        <TopBar title="Trace Details" />
        <div className="dashboard-content">
          <div className="card">
            <p style={{ color: "var(--red)" }}>Trace not found.</p>
          </div>
        </div>
      </>
    );
  }

  // Extract decision and triage from trace steps
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
          className="btn btn-secondary"
          onClick={() => router.push("/dashboard/anomaly")}
          style={{ marginBottom: "1rem" }}
        >
          &larr; Back to Anomaly Dashboard
        </button>

        <div className="card">
          <div className="row" style={{ marginBottom: "0.75rem" }}>
            <span className="badge badge-orange">{trace.provider}</span>
            <span style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>
              {new Date(trace.createdAt).toLocaleString()}
            </span>
            <span style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>
              {trace.steps.length} steps
            </span>
          </div>

          {/* Anomaly data */}
          {anomalyStep && (
            <div style={{ marginBottom: "1rem" }}>
              <h2 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>Anomaly Data</h2>
              <JsonView data={(anomalyStep.data as Record<string, unknown>)?.anomaly || anomalyStep.data} maxHeight={200} />
            </div>
          )}

          {/* Decision */}
          {decisionStep && (
            <div style={{ marginBottom: "1rem" }}>
              <h2 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>Patient Decision</h2>
              {(() => {
                const decision = (decisionStep.data as Record<string, unknown>)?.decision as Record<string, unknown> | undefined;
                if (!decision) return <JsonView data={decisionStep.data} maxHeight={200} />;
                return (
                  <>
                    <div className="row" style={{ marginBottom: "0.5rem" }}>
                      <StatusBadge status={(decision.urgency as string) as "urgent" | "soon" | "routine"} />
                      {Boolean(decision.should_contact_clinic) && <span className="badge badge-red">ESCALATED</span>}
                    </div>
                    <div className="friendly-text">{decision.summary_explanation as string}</div>
                    {(decision.questions as string[])?.length > 0 && (
                      <div style={{ marginTop: "0.75rem" }}>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginBottom: "0.25rem" }}>
                          FOLLOW-UP QUESTIONS
                        </div>
                        {(decision.questions as string[]).map((q, i) => (
                          <div key={i} style={{ fontSize: "0.8125rem", padding: "0.25rem 0" }}>
                            {i + 1}. {q}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}

          {/* Triage */}
          {triageSteps.length > 0 && (
            <div style={{ marginBottom: "1rem" }}>
              <div className="divider" />
              <h2 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>Triage Outcome</h2>
              {triageSteps.map((step, i) => (
                <div key={i} style={{ marginBottom: "0.5rem" }}>
                  <span className="badge badge-blue" style={{ marginBottom: "0.25rem" }}>
                    {step.event}
                  </span>
                  <JsonView data={step.data} maxHeight={150} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Full trace timeline */}
        <div className="card">
          <h2 style={{ fontSize: "1rem", marginBottom: "0.75rem" }}>
            Full Trace ({trace.steps.length} steps)
          </h2>
          <TraceViewer steps={trace.steps} provider={trace.provider} />
        </div>
      </div>
    </>
  );
}
