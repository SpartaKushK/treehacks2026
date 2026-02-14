"use client";

import type { TraceStep } from "@people/shared";

interface Props {
  steps: TraceStep[];
  provider?: string;
}

const EVENT_LABELS: Record<string, string> = {
  registry_lookup: "Registry Lookup",
  sign_payload: "Sign Payload",
  invoke_request: "Invoke Request",
  signature_verified: "Signature Verified",
  policy_allow: "Policy: ALLOW",
  policy_deny: "Policy: DENY",
  payment_required: "Payment Required",
  capability_result: "Capability Result",
  llm_plan: "LLM Planner",
  booking_confirmed: "Booking Confirmed",
  error: "Error",
};

function badgeClass(event: string): string {
  if (event === "signature_verified") return "badge-green";
  if (event === "policy_allow") return "badge-green";
  if (event === "policy_deny") return "badge-red";
  if (event === "payment_required") return "badge-yellow";
  if (event === "llm_plan") return "badge-purple";
  if (event === "booking_confirmed") return "badge-green";
  if (event === "error") return "badge-red";
  return "badge-blue";
}

export default function TraceViewer({ steps, provider }: Props) {
  if (!steps || steps.length === 0) {
    return <div style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>No trace steps yet.</div>;
  }

  return (
    <div className="trace-timeline">
      {steps.map((step, i) => {
        const verified =
          step.event === "signature_verified" &&
          (step.data as Record<string, unknown>)?.verified === true;

        return (
          <div key={i} className={`trace-step ${step.ok ? "ok" : "fail"}`}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
              <span className="actor">{step.actor}</span>
              <span className={`badge ${badgeClass(step.event)}`}>
                {EVENT_LABELS[step.event] || step.event}
              </span>
              {step.event === "signature_verified" && (
                <span
                  className={`badge ${verified ? "badge-green" : "badge-red"}`}
                  style={{ fontSize: "0.75rem", fontWeight: 700 }}
                >
                  {verified ? "VERIFIED" : "FAILED"}
                </span>
              )}
              {step.provider && (
                <span className="badge badge-orange">{step.provider}</span>
              )}
              <span className="time">
                {new Date(step.t).toLocaleTimeString()}
              </span>
            </div>
            {step.data != null && (
              <div className="data">
                {JSON.stringify(step.data, null, 2) as string}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
