"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookOpen, ExternalLink, AlertTriangle, Shield, Pill, ArrowLeft, FileText } from "lucide-react";

interface Study {
  title: string;
  authors: string;
  pmid: string;
  url: string;
  journal: string;
  year: string;
}

interface Guideline {
  condition: string;
  recommendation: string;
  source: string;
  url?: string;
}

interface DrugInteraction {
  drug: string;
  warning: string;
  severity: "low" | "moderate" | "high";
  source: string;
}

interface EvidenceData {
  studies: Study[];
  guidelines: Guideline[];
  drugInteractions: DrugInteraction[];
  patientFriendlySummary: string;
  queriedAt: string;
}

interface AlertInfo {
  alertId: string;
  severity: string;
  anomalyScore: number;
  flags: string[];
}

const severityColors: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  high: { bg: "#fef2f2", border: "#fecaca", text: "#991b1b", badge: "#dc2626" },
  moderate: { bg: "#fffbeb", border: "#fde68a", text: "#92400e", badge: "#d97706" },
  low: { bg: "#f0fdf4", border: "#bbf7d0", text: "#166534", badge: "#16a34a" },
};

export default function ClinicalEvidencePage() {
  const [evidence, setEvidence] = useState<EvidenceData | null>(null);
  const [alertInfo, setAlertInfo] = useState<AlertInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchEvidence() {
      try {
        const res = await fetch("/api/evidence?live=true");
        if (res.ok) {
          const json = await res.json();
          if (json.evidence) {
            setEvidence(json.evidence);
            setAlertInfo({
              alertId: json.alertId || "",
              severity: json.severity || "routine",
              anomalyScore: json.anomalyScore || 0,
              flags: json.flags || [],
            });
          } else {
            // No active alerts — fetch demo evidence
            const demoRes = await fetch("/api/evidence?flags=RHR_SPIKE,SLEEP_DROP");
            if (demoRes.ok) {
              const demoJson = await demoRes.json();
              setEvidence(demoJson.evidence);
              setAlertInfo({
                alertId: "",
                severity: "soon",
                anomalyScore: 75,
                flags: ["RHR_SPIKE", "SLEEP_DROP"],
              });
            }
          }
        }
      } catch {
        // Fallback: fetch evidence for common flags
        try {
          const fallbackRes = await fetch("/api/evidence?flags=RHR_SPIKE,SLEEP_DROP");
          if (fallbackRes.ok) {
            const json = await fallbackRes.json();
            setEvidence(json.evidence);
            setAlertInfo({
              alertId: "",
              severity: "soon",
              anomalyScore: 75,
              flags: ["RHR_SPIKE", "SLEEP_DROP"],
            });
          }
        } catch { /* ignore */ }
      } finally {
        setLoading(false);
      }
    }
    fetchEvidence();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-12 h-12 rounded-full" style={{ border: "4px solid #bfdbfe", borderTopColor: "#2563eb", animation: "spin 0.6s linear infinite" }} />
      </div>
    );
  }

  if (!evidence) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold" style={{ color: "#0f172a" }}>Clinical Evidence</h1>
        <Card style={{ border: "2px solid #f1f5f9", borderRadius: 16 }}>
          <CardContent className="p-6 text-center">
            <BookOpen className="w-12 h-12 mx-auto mb-4" style={{ color: "#94a3b8" }} />
            <p style={{ color: "#64748b" }}>No clinical evidence available yet. Evidence will appear here when a health anomaly is detected.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const flagLabels: Record<string, string> = {
    RHR_SPIKE: "Elevated Heart Rate",
    SLEEP_DROP: "Sleep Decline",
    HRV_DROP: "Low HRV",
    LOW_STEPS: "Low Activity",
    HIGH_SYMPTOM: "High Symptoms",
    MED_NONADHERENCE: "Medication Adherence",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/patient/alert">
          <Button variant="ghost" size="sm" style={{ borderRadius: 10 }}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold" style={{ color: "#0f172a" }}>Clinical Evidence</h1>
          <p className="text-sm" style={{ color: "#94a3b8" }}>Evidence-based insights for your health data</p>
        </div>
      </div>

      {/* Detected Flags */}
      {alertInfo && alertInfo.flags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {alertInfo.flags.map((flag, i) => (
            <span key={i} className="px-3 py-1 text-sm font-medium" style={{ background: "#eff6ff", color: "#2563eb", borderRadius: 20 }}>
              {flagLabels[flag] || flag}
            </span>
          ))}
        </div>
      )}

      {/* Patient-Friendly Summary */}
      {evidence.patientFriendlySummary && (
        <Card style={{ border: "2px solid #dbeafe", borderRadius: 16, background: "#eff6ff" }}>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="w-5 h-5" style={{ color: "#2563eb" }} />
              <h2 className="font-bold" style={{ color: "#1e3a8a" }}>Summary</h2>
            </div>
            <p className="text-sm" style={{ color: "#334155", lineHeight: 1.7, whiteSpace: "pre-line" }}>
              {evidence.patientFriendlySummary}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Clinical Guidelines */}
      {evidence.guidelines.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-5 h-5" style={{ color: "#2563eb" }} />
            <h2 className="text-xl font-bold" style={{ color: "#0f172a" }}>Clinical Guidelines</h2>
          </div>
          <div className="space-y-3">
            {evidence.guidelines.map((g, i) => (
              <Card key={i} style={{ border: "2px solid #f1f5f9", borderRadius: 16 }}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <h3 className="font-bold" style={{ color: "#1e293b" }}>{g.condition}</h3>
                    <span className="text-xs px-2 py-1 font-medium shrink-0" style={{ background: "#eff6ff", color: "#2563eb", borderRadius: 8 }}>
                      {g.source}
                    </span>
                  </div>
                  <p className="text-sm" style={{ color: "#475569", lineHeight: 1.6 }}>{g.recommendation}</p>
                  {g.url && (
                    <a href={g.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm mt-3" style={{ color: "#2563eb" }}>
                      Learn more <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* PubMed Studies */}
      {evidence.studies.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="w-5 h-5" style={{ color: "#8b5cf6" }} />
            <h2 className="text-xl font-bold" style={{ color: "#0f172a" }}>Research Studies</h2>
            <span className="text-sm" style={{ color: "#94a3b8" }}>({evidence.studies.length} found)</span>
          </div>
          <div className="space-y-3">
            {evidence.studies.map((s, i) => (
              <Card key={i} style={{ border: "2px solid #f1f5f9", borderRadius: 16 }}>
                <CardContent className="p-5">
                  <h3 className="font-semibold text-sm" style={{ color: "#1e293b", lineHeight: 1.4 }}>{s.title}</h3>
                  <p className="text-xs mt-2" style={{ color: "#64748b" }}>{s.authors}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-xs" style={{ color: "#94a3b8" }}>{s.journal}</span>
                    <span className="text-xs" style={{ color: "#94a3b8" }}>{s.year}</span>
                    <span className="text-xs px-2 py-0.5" style={{ background: "#f1f5f9", color: "#64748b", borderRadius: 6 }}>
                      PMID: {s.pmid}
                    </span>
                  </div>
                  <a href={s.url} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm" className="mt-3" style={{ borderRadius: 10, borderColor: "#e2e8f0", color: "#8b5cf6" }}>
                      <ExternalLink className="w-3 h-3 mr-1" /> View on PubMed
                    </Button>
                  </a>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Drug Interactions */}
      {evidence.drugInteractions.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Pill className="w-5 h-5" style={{ color: "#d97706" }} />
            <h2 className="text-xl font-bold" style={{ color: "#0f172a" }}>Drug Interactions</h2>
          </div>
          <div className="space-y-3">
            {evidence.drugInteractions.map((d, i) => {
              const colors = severityColors[d.severity] || severityColors.low;
              return (
                <Card key={i} style={{ border: `2px solid ${colors.border}`, borderRadius: 16, background: colors.bg }}>
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="w-4 h-4" style={{ color: colors.badge }} />
                      <h3 className="font-bold" style={{ color: colors.text }}>{d.drug}</h3>
                      <span className="text-xs px-2 py-0.5 font-medium" style={{ background: colors.badge, color: "white", borderRadius: 8 }}>
                        {d.severity}
                      </span>
                    </div>
                    <p className="text-sm" style={{ color: "#475569" }}>{d.warning}</p>
                    <p className="text-xs mt-2" style={{ color: "#94a3b8" }}>Source: {d.source}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Footer */}
      <Card style={{ border: "2px solid #f1f5f9", borderRadius: 16 }}>
        <CardContent className="p-4">
          <p className="text-xs text-center" style={{ color: "#94a3b8", lineHeight: 1.5 }}>
            This information is sourced from PubMed, FDA, and clinical guidelines.
            It is intended to support — not replace — professional medical advice.
            Always consult your healthcare provider for personalized guidance.
          </p>
          {evidence.queriedAt && (
            <p className="text-xs text-center mt-2" style={{ color: "#cbd5e1" }}>
              Last updated: {new Date(evidence.queriedAt).toLocaleString()}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
