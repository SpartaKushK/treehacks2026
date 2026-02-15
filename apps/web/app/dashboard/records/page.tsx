"use client";

import { useEffect, useState, useCallback } from "react";
import TopBar from "@/components/TopBar";
import StatusBadge from "@/components/StatusBadge";
import { FileText, Activity, AlertTriangle } from "lucide-react";

// Mock health records for demonstration (OpenEvidence track)
const MOCK_RECORDS = [
  {
    id: "mock-ext-1",
    type: "extraction" as const,
    category: "medication",
    summary: "Patient reported taking Lisinopril 10mg daily for blood pressure management",
    date: new Date(Date.now() - 86400000).toISOString(),
    data: {
      rawContent: "I've been taking my blood pressure medication, Lisinopril 10 milligrams, every morning with breakfast.",
      summary: "Patient reported taking Lisinopril 10mg daily for blood pressure management",
      structuredData: JSON.stringify({
        medication_name: "Lisinopril",
        dosage: "10mg",
        frequency: "daily",
        timing: "morning with breakfast",
        adherence: "compliant"
      }),
      confidence: 0.95,
      mentionedDate: new Date().toISOString().split('T')[0],
      conversationId: "mock-conv-1"
    }
  },
  {
    id: "mock-ext-2",
    type: "extraction" as const,
    category: "symptom",
    summary: "Patient experiencing mild joint pain in knees, severity 4/10, worse in mornings",
    date: new Date(Date.now() - 172800000).toISOString(),
    data: {
      rawContent: "My knees have been bothering me lately, especially when I wake up. I'd say the pain is about a 4 out of 10.",
      summary: "Patient experiencing mild joint pain in knees, severity 4/10, worse in mornings",
      structuredData: JSON.stringify({
        symptom: "joint pain",
        location: "knees",
        severity: "4/10",
        timing: "worse in mornings",
        onset: "recent"
      }),
      confidence: 0.88,
      mentionedDate: new Date(Date.now() - 172800000).toISOString().split('T')[0],
      conversationId: "mock-conv-2"
    }
  },
  {
    id: "mock-ext-3",
    type: "extraction" as const,
    category: "appointment",
    summary: "Upcoming cardiology follow-up scheduled for next week regarding recent ECG results",
    date: new Date(Date.now() - 259200000).toISOString(),
    data: {
      rawContent: "I have my follow-up with the cardiologist next Tuesday to discuss my ECG results from last month.",
      summary: "Upcoming cardiology follow-up scheduled for next week regarding recent ECG results",
      structuredData: JSON.stringify({
        appointment_type: "cardiology follow-up",
        timing: "next Tuesday",
        purpose: "discuss ECG results",
        status: "scheduled"
      }),
      confidence: 0.92,
      mentionedDate: new Date(Date.now() + 432000000).toISOString().split('T')[0],
      conversationId: "mock-conv-3"
    }
  },
  {
    id: "mock-metric-1",
    type: "metric" as const,
    category: "daily-health",
    summary: "Sleep 7.2h | 5,800 steps | Symptom 3.1",
    date: new Date(Date.now() - 86400000).toISOString(),
    data: {
      sleepHours: 7.2,
      steps: 5800,
      medAdherence: true,
      symptomScore: 3.1
    }
  },
  {
    id: "mock-metric-2",
    type: "metric" as const,
    category: "daily-health",
    summary: "Sleep 6.5h | 4,200 steps | Symptom 4.3",
    date: new Date(Date.now() - 172800000).toISOString(),
    data: {
      sleepHours: 6.5,
      steps: 4200,
      medAdherence: true,
      symptomScore: 4.3
    }
  },
  {
    id: "mock-alert-1",
    type: "alert" as const,
    category: "urgent",
    summary: "Patient sleep dropped to 4 hours (usual: 7.5 hours). Heart rate elevated above normal range.",
    date: new Date(Date.now() - 259200000).toISOString(),
    data: {
      anomalyScore: 85,
      severity: "urgent",
      status: "active",
      flagsJson: JSON.stringify(["SLEEP_DROP", "RHR_SPIKE"]),
      decisionJson: JSON.stringify({
        summary_explanation: "Patient sleep dropped to 4 hours (usual: 7.5 hours). Heart rate elevated above normal range. Recommend follow-up call."
      }),
      evidenceJson: JSON.stringify({
        sleep_trend: "↓ 47% from baseline",
        heart_rate: "92 bpm (baseline: 68 bpm)",
        duration: "3 consecutive nights"
      }),
      triageOutcomeJson: JSON.stringify({
        recommendation: "Schedule nurse call within 24 hours",
        urgency: "high",
        suggested_actions: ["Assess for acute illness", "Review medication compliance", "Check for recent stressors"]
      }),
      traceId: null
    }
  }
];

interface HealthRecord {
  id: string;
  type: "extraction" | "metric" | "alert";
  category: string;
  summary: string;
  date: string;
  data: Record<string, unknown>;
}

const TYPE_LABELS: Record<string, string> = {
  extraction: "Extraction",
  metric: "Metric",
  alert: "Alert",
};

const TYPE_COLORS: Record<string, string> = {
  extraction: "badge-blue",
  metric: "badge-green",
  alert: "badge-red",
};

export default function RecordsPage() {
  const [records, setRecords] = useState<HealthRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState("all");
  const [selectedRecord, setSelectedRecord] = useState<string | null>(null);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterType !== "all") params.set("type", filterType);
    try {
      const res = await fetch(`/api/health-records?${params}`);
      const data = await res.json();
      setRecords(data.records || []);
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, [filterType]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const extractionCount = records.filter((r) => r.type === "extraction").length;
  const metricCount = records.filter((r) => r.type === "metric").length;
  const alertCount = records.filter((r) => r.type === "alert").length;

  return (
    <>
      <TopBar title="Health Records" />
      <div className="dashboard-content">
        {/* Header */}
        <div style={{ marginBottom: "1.5rem" }}>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: "0.5rem", lineHeight: "1.3" }}>
            Health Records
          </h1>
          <p style={{ fontSize: "1rem", color: "var(--text-dim)", lineHeight: "1.6" }}>
            Browse all health data &mdash; extractions from conversations, daily metrics from HealthKit, and anomaly alerts.
          </p>
        </div>

        {/* Stats */}
        <div className="agent-stats">
          <div className="agent-stat">
            <div className="agent-stat-val">{records.length}</div>
            <div className="agent-stat-lbl">Total Records</div>
          </div>
          <div className="agent-stat">
            <div className="agent-stat-val">{extractionCount}</div>
            <div className="agent-stat-lbl">Extractions</div>
          </div>
          <div className="agent-stat">
            <div className="agent-stat-val">{metricCount}</div>
            <div className="agent-stat-lbl">Metrics</div>
          </div>
          <div className="agent-stat">
            <div className="agent-stat-val" style={{ color: alertCount > 0 ? "var(--red)" : "var(--text)" }}>
              {alertCount}
            </div>
            <div className="agent-stat-lbl">Alerts</div>
          </div>
        </div>

        {/* Records List */}
        <div className="agent-section-header">
          <span className="agent-section-title">All Records</span>
          <span className="agent-section-line" />
          <select
            className="filter-select"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option value="all">All Types</option>
            <option value="extraction">Extractions</option>
            <option value="metric">Metrics</option>
            <option value="alert">Alerts</option>
          </select>
        </div>

        {loading ? (
          <div style={{ padding: "2rem", textAlign: "center" }}>
            <span className="spinner" />
          </div>
        ) : (
          <>
            {records.length === 0 && (
              <div
                style={{
                  padding: "1rem 1.25rem",
                  marginBottom: "1rem",
                  background: "#E6F5F2",
                  border: "1px solid #1A7A6D",
                  borderRadius: "8px",
                  fontSize: "1rem",
                  color: "#1A7A6D",
                  lineHeight: "1.5",
                }}
              >
                🏥 <strong>Showing example clinical records</strong> — Start conversations or connect HealthKit to see real health data
              </div>
            )}
            <div className="agent-feed">
            {(records.length > 0 ? records : MOCK_RECORDS).map((record) => {
              const isExpanded = selectedRecord === record.id;
              return (
                <div
                  key={record.id}
                  className="agent-feed-item"
                  style={{ cursor: "pointer" }}
                  onClick={() => setSelectedRecord(isExpanded ? null : record.id)}
                >
                  <div className="agent-feed-icon">
                    {record.type === "extraction" ? <FileText size={16} /> : record.type === "metric" ? <Activity size={16} /> : <AlertTriangle size={16} />}
                  </div>
                  <div className="agent-feed-body" style={{ flex: 1 }}>
                    <div style={{ display: "flex", gap: "0.375rem", marginBottom: "0.375rem", flexWrap: "wrap", alignItems: "center" }}>
                      <span className={`badge ${TYPE_COLORS[record.type]}`}>
                        {TYPE_LABELS[record.type]}
                      </span>
                      {record.type === "extraction" && (
                        <span className="badge badge-yellow" style={{ fontSize: "0.8125rem", lineHeight: "1.4" }}>
                          {record.category}
                        </span>
                      )}
                      {record.type === "alert" && (
                        <StatusBadge status={record.category as "urgent" | "soon" | "routine"} />
                      )}
                    </div>
                    <div className="agent-feed-txt">{record.summary}</div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div
                        style={{
                          marginTop: "0.75rem",
                          padding: "0.75rem",
                          background: "var(--bg-main)",
                          border: "1px solid var(--border)",
                          borderRadius: "8px",
                          fontSize: "0.8125rem",
                          lineHeight: "1.5",
                        }}
                      >
                        {record.type === "extraction" && (
                          <ExtractionDetail data={record.data} />
                        )}
                        {record.type === "metric" && (
                          <MetricDetail data={record.data} />
                        )}
                        {record.type === "alert" && (
                          <AlertDetail data={record.data} />
                        )}
                      </div>
                    )}
                  </div>
                  <div className="agent-feed-time">
                    {new Date(record.date).toLocaleString()}
                  </div>
                </div>
              );
            })}
          </div>
          </>
        )}

        <div className="agent-footer">CARESYNC — TREEHACKS 2026</div>
      </div>
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.375rem" }}>
      <span style={{ fontWeight: 600, color: "var(--text-dim)", minWidth: "110px" }}>{label}:</span>
      <span style={{ wordBreak: "break-word" }}>{value}</span>
    </div>
  );
}

function ExtractionDetail({ data }: { data: Record<string, unknown> }) {
  let structured: string | null = null;
  try {
    const parsed = JSON.parse(data.structuredData as string);
    if (Object.keys(parsed).length > 0) {
      structured = JSON.stringify(parsed, null, 2);
    }
  } catch {
    /* ignore */
  }

  return (
    <>
      <DetailRow label="Summary" value={data.summary as string} />
      <DetailRow label="Raw Content" value={data.rawContent as string} />
      <DetailRow label="Confidence" value={`${((data.confidence as number) * 100).toFixed(0)}%`} />
      <DetailRow label="Mentioned Date" value={data.mentionedDate as string} />
      {structured && (
        <div style={{ marginTop: "0.375rem" }}>
          <span style={{ fontWeight: 600, color: "var(--text-dim)" }}>Structured Data:</span>
          <pre
            style={{
              marginTop: "0.25rem",
              padding: "0.5rem",
              background: "var(--bg-card)",
              borderRadius: "6px",
              fontSize: "0.8125rem",
              overflow: "auto",
              lineHeight: "1.5",
            }}
          >
            {structured}
          </pre>
        </div>
      )}
    </>
  );
}

function MetricDetail({ data }: { data: Record<string, unknown> }) {
  return (
    <>
      <DetailRow label="Sleep" value={`${(data.sleepHours as number).toFixed(1)} hours`} />
      <DetailRow label="Steps" value={(data.steps as number).toLocaleString()} />
      <DetailRow label="Med Adherence" value={data.medAdherence ? "Yes" : "No"} />
      <DetailRow label="Symptom Score" value={(data.symptomScore as number).toFixed(1)} />
    </>
  );
}

function AlertDetail({ data }: { data: Record<string, unknown> }) {
  const flags = JSON.parse((data.flagsJson as string) || "[]");
  const decision = JSON.parse((data.decisionJson as string) || "{}");
  const evidence = data.evidenceJson ? JSON.parse(data.evidenceJson as string) : null;
  const triage = data.triageOutcomeJson ? JSON.parse(data.triageOutcomeJson as string) : null;

  return (
    <>
      <DetailRow label="Severity" value={data.severity as string} />
      <DetailRow label="Status" value={data.status as string} />
      <DetailRow label="Anomaly Score" value={String(data.anomalyScore)} />
      {flags.length > 0 && (
        <div style={{ marginBottom: "0.375rem" }}>
          <span style={{ fontWeight: 600, color: "var(--text-dim)" }}>Flags: </span>
          {flags.map((f: string) => (
            <span key={f} className="badge badge-yellow" style={{ fontSize: "0.6rem", marginRight: "0.25rem" }}>
              {f}
            </span>
          ))}
        </div>
      )}
      {decision.summary_explanation && (
        <DetailRow label="Decision" value={decision.summary_explanation} />
      )}
      {evidence && (
        <div style={{ marginTop: "0.375rem" }}>
          <span style={{ fontWeight: 600, color: "var(--text-dim)" }}>Evidence:</span>
          <pre
            style={{
              marginTop: "0.25rem",
              padding: "0.5rem",
              background: "var(--bg-card)",
              borderRadius: "6px",
              fontSize: "0.8125rem",
              overflow: "auto",
              lineHeight: "1.5",
            }}
          >
            {JSON.stringify(evidence, null, 2)}
          </pre>
        </div>
      )}
      {triage && (
        <div style={{ marginTop: "0.375rem" }}>
          <span style={{ fontWeight: 600, color: "var(--text-dim)" }}>Triage Outcome:</span>
          <pre
            style={{
              marginTop: "0.25rem",
              padding: "0.5rem",
              background: "var(--bg-card)",
              borderRadius: "6px",
              fontSize: "0.8125rem",
              overflow: "auto",
              lineHeight: "1.5",
            }}
          >
            {JSON.stringify(triage, null, 2)}
          </pre>
        </div>
      )}
    </>
  );
}
