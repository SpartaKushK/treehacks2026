"use client";

import type { ClinicalEntities } from "@/lib/voice/types";
import { AlertTriangle, Pill, Heart, ShieldAlert, Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Props {
  entities: ClinicalEntities;
  actions: { label: string; done: boolean }[];
}

export default function ClinicalSidebar({ entities, actions }: Props) {
  const hasAny =
    entities.symptoms.length > 0 ||
    entities.medications.length > 0 ||
    entities.allergies.length > 0 ||
    entities.conditions.length > 0 ||
    entities.redFlags.length > 0;

  return (
    <div className="space-y-4">
      {/* Red Flags */}
      {entities.redFlags.length > 0 && (
        <div
          style={{
            background: "#fef2f2",
            border: "2px solid #fecaca",
            borderRadius: 12,
            padding: "0.75rem",
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <ShieldAlert className="w-4 h-4" style={{ color: "#dc2626" }} />
            <span className="text-sm font-bold" style={{ color: "#991b1b" }}>
              Red Flags ({entities.redFlags.length})
            </span>
          </div>
          <div className="space-y-2">
            {entities.redFlags.map((rf, i) => (
              <div
                key={i}
                className="flex items-start gap-2"
                style={{
                  padding: "0.5rem",
                  borderRadius: 8,
                  background: rf.severity === "critical" ? "#fee2e2" : "#fef9c3",
                }}
              >
                <AlertTriangle
                  className="w-4 h-4 flex-shrink-0 mt-0.5"
                  style={{
                    color: rf.severity === "critical" ? "#dc2626" : "#d97706",
                  }}
                />
                <div>
                  <p
                    className="text-xs font-semibold"
                    style={{
                      color: rf.severity === "critical" ? "#991b1b" : "#92400e",
                    }}
                  >
                    {rf.flag}
                  </p>
                  <p className="text-xs" style={{ color: "#64748b" }}>
                    {rf.action}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Symptoms */}
      {entities.symptoms.length > 0 && (
        <Section
          icon={<Heart className="w-4 h-4" style={{ color: "#ef4444" }} />}
          title="Symptoms"
        >
          <div className="flex flex-wrap gap-1.5">
            {entities.symptoms.map((s, i) => (
              <Badge
                key={i}
                variant={
                  s.severity === "severe"
                    ? "danger"
                    : s.severity === "moderate"
                      ? "warning"
                      : "secondary"
                }
              >
                {s.name}
                {s.severity !== "mild" && ` (${s.severity})`}
              </Badge>
            ))}
          </div>
        </Section>
      )}

      {/* Medications */}
      {entities.medications.length > 0 && (
        <Section
          icon={<Pill className="w-4 h-4" style={{ color: "#2563eb" }} />}
          title="Medications"
        >
          <div className="flex flex-wrap gap-1.5">
            {entities.medications.map((m, i) => (
              <Badge
                key={i}
                variant={
                  m.compliance === "stopped" || m.compliance === "missed"
                    ? "danger"
                    : m.compliance === "taking"
                      ? "success"
                      : "secondary"
                }
              >
                {m.name}
                {m.dosage && ` ${m.dosage}`}
                {m.compliance !== "unknown" && ` — ${m.compliance}`}
              </Badge>
            ))}
          </div>
        </Section>
      )}

      {/* Allergies */}
      {entities.allergies.length > 0 && (
        <Section
          icon={<AlertTriangle className="w-4 h-4" style={{ color: "#d97706" }} />}
          title="Allergies"
        >
          <div className="flex flex-wrap gap-1.5">
            {entities.allergies.map((a, i) => (
              <Badge key={i} variant="warning">
                {a}
              </Badge>
            ))}
          </div>
        </Section>
      )}

      {/* Conditions */}
      {entities.conditions.length > 0 && (
        <Section
          icon={<Activity className="w-4 h-4" style={{ color: "#8b5cf6" }} />}
          title="Conditions"
        >
          <div className="flex flex-wrap gap-1.5">
            {entities.conditions.map((c, i) => (
              <Badge key={i} variant="secondary">
                {c}
              </Badge>
            ))}
          </div>
        </Section>
      )}

      {/* Automated Actions */}
      {actions.length > 0 && (
        <Section
          icon={<Activity className="w-4 h-4" style={{ color: "#16a34a" }} />}
          title="Automated Actions"
        >
          <div className="space-y-1.5">
            {actions.map((a, i) => (
              <div key={i} className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{
                    background: a.done ? "#dcfce7" : "#f1f5f9",
                    border: `1.5px solid ${a.done ? "#16a34a" : "#cbd5e1"}`,
                  }}
                >
                  {a.done && (
                    <span style={{ color: "#16a34a", fontSize: 10, fontWeight: 700 }}>
                      ✓
                    </span>
                  )}
                </div>
                <span
                  className="text-xs"
                  style={{ color: a.done ? "#1e293b" : "#94a3b8" }}
                >
                  {a.label}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {!hasAny && actions.length === 0 && (
        <p className="text-xs text-center py-4" style={{ color: "#94a3b8" }}>
          Clinical entities will appear here as the conversation progresses...
        </p>
      )}
    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "#f8fafc",
        border: "1px solid #e2e8f0",
        borderRadius: 10,
        padding: "0.625rem",
      }}
    >
      <div className="flex items-center gap-1.5 mb-2">
        {icon}
        <span className="text-xs font-semibold" style={{ color: "#475569" }}>
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}
