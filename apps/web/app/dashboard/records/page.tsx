"use client";

import { useEffect, useState, useCallback } from "react";
import TopBar from "@/components/TopBar";
import StatusBadge from "@/components/StatusBadge";

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
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>
            Health Records
          </h1>
          <p style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>
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
        ) : records.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              color: "var(--text-dim)",
              fontSize: "0.8rem",
              padding: "1.5rem",
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "10px",
            }}
          >
            No health records found. Start a conversation or connect HealthKit to see records here.
          </div>
        ) : (
          <div className="agent-feed">
            {records.map((record) => {
              const isExpanded = selectedRecord === record.id;
              return (
                <div
                  key={record.id}
                  className="agent-feed-item"
                  style={{ cursor: "pointer" }}
                  onClick={() => setSelectedRecord(isExpanded ? null : record.id)}
                >
                  <div className="agent-feed-icon">
                    {record.type === "extraction" ? "+" : record.type === "metric" ? "#" : "!"}
                  </div>
                  <div className="agent-feed-body" style={{ flex: 1 }}>
                    <div style={{ display: "flex", gap: "0.375rem", marginBottom: "0.375rem", flexWrap: "wrap", alignItems: "center" }}>
                      <span className={`badge ${TYPE_COLORS[record.type]}`}>
                        {TYPE_LABELS[record.type]}
                      </span>
                      {record.type === "extraction" && (
                        <span className="badge badge-yellow" style={{ fontSize: "0.6rem" }}>
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
                          fontSize: "0.75rem",
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
              fontSize: "0.7rem",
              overflow: "auto",
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
              fontSize: "0.7rem",
              overflow: "auto",
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
              fontSize: "0.7rem",
              overflow: "auto",
            }}
          >
            {JSON.stringify(triage, null, 2)}
          </pre>
        </div>
      )}
    </>
  );
}
