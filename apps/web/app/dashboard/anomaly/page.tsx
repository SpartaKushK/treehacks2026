"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";
import StatusBadge from "@/components/StatusBadge";

// Mock data for when no real data is available
const MOCK_LIVE_DATA = [
  {
    handle: "demo_patient_1",
    displayName: "Sarah Johnson (Example)",
    avatarPhotoUrl: null,
    latestMetrics: { sleepHours: 7.2, steps: 5800, symptomScore: 3.1 },
    anomalyScore: 25,
    activeAlertCount: 0,
    urgency: "routine" as const,
  },
  {
    handle: "demo_patient_2",
    displayName: "Robert Chen (Example)",
    avatarPhotoUrl: null,
    latestMetrics: { sleepHours: 6.5, steps: 4200, symptomScore: 4.3 },
    anomalyScore: 42,
    activeAlertCount: 1,
    urgency: "soon" as const,
  },
  {
    handle: "demo_patient_3",
    displayName: "Margaret Wilson (Example)",
    avatarPhotoUrl: null,
    latestMetrics: { sleepHours: 8.1, steps: 6500, symptomScore: 2.5 },
    anomalyScore: 18,
    activeAlertCount: 0,
    urgency: "routine" as const,
  },
];

const MOCK_ALERTS = [
  {
    id: "mock-1",
    traceId: null,
    severity: "urgent",
    anomalyScore: 85,
    flagsJson: JSON.stringify(["SLEEP_DROP", "RHR_SPIKE"]),
    decisionJson: JSON.stringify({
      summary_explanation: "Patient sleep dropped to 4 hours (usual: 7.5 hours). Heart rate elevated above normal range. Recommend follow-up call.",
    }),
    status: "active",
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: "mock-2",
    traceId: null,
    severity: "soon",
    anomalyScore: 62,
    flagsJson: JSON.stringify(["ACTIVITY_DROP"]),
    decisionJson: JSON.stringify({
      summary_explanation: "Daily step count below 2000 for 3 consecutive days (usual: 5000 steps). May indicate reduced mobility or engagement.",
    }),
    status: "active",
    createdAt: new Date(Date.now() - 172800000).toISOString(),
  },
  {
    id: "mock-3",
    traceId: null,
    severity: "routine",
    anomalyScore: 45,
    flagsJson: JSON.stringify(["SYMPTOM_INCREASE"]),
    decisionJson: JSON.stringify({
      summary_explanation: "Reported symptom severity increased from 2.0 to 4.5. Patient mentioned increased joint pain. Monitor for trends.",
    }),
    status: "resolved",
    createdAt: new Date(Date.now() - 259200000).toISOString(),
  },
];

interface LiveMetrics {
  handle: string;
  displayName: string;
  avatarPhotoUrl: string | null;
  latestMetrics: {
    sleepHours: number;
    steps: number;
    symptomScore: number;
  } | null;
  anomalyScore: number;
  activeAlertCount: number;
  urgency: "routine" | "soon" | "urgent";
}

interface AlertItem {
  id: string;
  traceId: string | null;
  severity: string;
  anomalyScore: number;
  flagsJson: string;
  decisionJson: string;
  status: string;
  createdAt: string;
}

export default function AnomalyPage() {
  const router = useRouter();
  const [liveData, setLiveData] = useState<LiveMetrics[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const loadLive = useCallback(async () => {
    try {
      const res = await fetch("/api/anomaly/live");
      const data = await res.json();
      setLiveData(data.agents || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  const loadHistory = useCallback(async () => {
    setAlertsLoading(true);
    const params = new URLSearchParams();
    if (filterSeverity !== "all") params.set("severity", filterSeverity);
    if (filterStatus !== "all") params.set("status", filterStatus);
    try {
      const res = await fetch(`/api/anomaly/history?${params}`);
      const data = await res.json();
      setAlerts(data.alerts || []);
    } catch { /* ignore */ }
    setAlertsLoading(false);
  }, [filterSeverity, filterStatus]);

  useEffect(() => {
    loadLive();
    const interval = setInterval(loadLive, 30000);
    return () => clearInterval(interval);
  }, [loadLive]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  async function updateAlertStatus(alertId: string, action: "resolve" | "dismiss") {
    await fetch(`/api/anomaly/${alertId}/${action}`, { method: "POST" });
    await loadHistory();
    await loadLive();
  }

  const urgentCount = alerts.filter((a) => a.severity === "urgent").length;
  const activeCount = alerts.filter((a) => a.status === "active").length;

  return (
    <>
      <TopBar title="Patient Alerts" />
      <div className="dashboard-content">
        {/* Header */}
        <div style={{ marginBottom: "1.5rem" }}>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: "0.5rem", lineHeight: "1.3" }}>
            Patient Alerts
          </h1>
          <p style={{ fontSize: "1rem", color: "var(--text-dim)", lineHeight: "1.6" }}>
            Real-time patient health monitoring &mdash; every alert is a chance to act early and keep your patients safe.
          </p>
        </div>

        {/* Stats */}
        <div className="agent-stats">
          <div className="agent-stat">
            <div className="agent-stat-val">{liveData.length}</div>
            <div className="agent-stat-lbl">Patients Monitored</div>
          </div>
          <div className="agent-stat">
            <div className="agent-stat-val">{alerts.length}</div>
            <div className="agent-stat-lbl">Total Alerts</div>
          </div>
          <div className="agent-stat">
            <div className="agent-stat-val" style={{ color: activeCount > 0 ? "var(--yellow)" : "var(--text)" }}>
              {activeCount}
            </div>
            <div className="agent-stat-lbl">Needs Attention</div>
          </div>
          <div className="agent-stat">
            <div className="agent-stat-val" style={{ color: urgentCount > 0 ? "var(--red)" : "var(--text)" }}>
              {urgentCount}
            </div>
            <div className="agent-stat-lbl">Urgent</div>
          </div>
        </div>

        {/* Live Health Status */}
        <div className="agent-section-header">
          <span className="agent-section-title">Patient Wellbeing — Live</span>
          <span className="agent-section-line" />
          <span className="agent-section-count">Auto-refreshes every 30s</span>
        </div>

        {loading ? (
          <div style={{ padding: "2rem", textAlign: "center" }}><span className="spinner" /></div>
        ) : (
          <>
            {liveData.length === 0 && (
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
                📊 <strong>Showing example data</strong> — Connect your care agents to see real patient monitoring
              </div>
            )}
            <div className="anomaly-live-grid">
            {(liveData.length > 0 ? liveData : MOCK_LIVE_DATA).map((agent) => (
              <div key={agent.handle} className={`anomaly-live-card anomaly-${agent.urgency}`}>
                <div className="anomaly-live-header">
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    {agent.avatarPhotoUrl ? (
                      <img src={agent.avatarPhotoUrl} alt={agent.displayName} style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover" }} />
                    ) : (
                      <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.875rem", fontWeight: 700, lineHeight: "1" }}>
                        {agent.displayName[0].toUpperCase()}
                      </div>
                    )}
                    <strong style={{ fontSize: "1rem", fontWeight: 700, lineHeight: "1.4" }}>{agent.displayName}</strong>
                  </div>
                  <StatusBadge status={agent.urgency} />
                </div>
                {agent.latestMetrics ? (
                  <div className="anomaly-live-metrics">
                    <div className="metric">
                      <span className="metric-value">{agent.latestMetrics.sleepHours.toFixed(1)}h</span>
                      <span className="metric-label">Sleep</span>
                    </div>
                    <div className="metric">
                      <span className="metric-value">{agent.latestMetrics.steps.toLocaleString()}</span>
                      <span className="metric-label">Steps</span>
                    </div>
                    <div className="metric">
                      <span className="metric-value">{agent.latestMetrics.symptomScore.toFixed(1)}</span>
                      <span className="metric-label">Symptoms</span>
                    </div>
                  </div>
                ) : (
                  <p style={{ fontSize: "0.875rem", color: "var(--text-dim)", lineHeight: "1.5" }}>No metrics available</p>
                )}
                <div className="anomaly-live-footer">
                  <span style={{ fontSize: "0.875rem", color: "var(--text-dim)", fontWeight: 600, lineHeight: "1.4" }}>
                    Score: {agent.anomalyScore}
                  </span>
                  {agent.activeAlertCount > 0 && (
                    <span className="badge badge-red" style={{ fontSize: "0.8125rem", fontWeight: 700, lineHeight: "1.4" }}>{agent.activeAlertCount} active</span>
                  )}
                </div>
              </div>
            ))}
          </div>
          </>
        )}

        {/* Alert History */}
        <div className="agent-section-header">
          <span className="agent-section-title">Alert History</span>
          <span className="agent-section-line" />
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <select
              className="filter-select"
              value={filterSeverity}
              onChange={(e) => setFilterSeverity(e.target.value)}
            >
              <option value="all">All Severity</option>
              <option value="urgent">Urgent</option>
              <option value="soon">Soon</option>
              <option value="routine">Routine</option>
            </select>
            <select
              className="filter-select"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="resolved">Resolved</option>
              <option value="dismissed">Dismissed</option>
            </select>
          </div>
        </div>

        {alertsLoading ? (
          <div style={{ padding: "1rem", textAlign: "center" }}><span className="spinner" /></div>
        ) : (
          <>
            {alerts.length === 0 && (
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
                📊 <strong>Showing example alerts</strong> — Connect your care agents to see real patient monitoring
              </div>
            )}
            <div className="agent-feed">
            {(alerts.length > 0 ? alerts : MOCK_ALERTS).map((alert) => {
              const decision = JSON.parse(alert.decisionJson || "{}");
              const flags = JSON.parse(alert.flagsJson || "[]");
              const severityIcon = alert.severity === "urgent" ? "🔴" : alert.severity === "soon" ? "🟡" : "🟢";
              return (
                <div key={alert.id} className="agent-feed-item">
                  <div className="agent-feed-icon">{severityIcon}</div>
                  <div className="agent-feed-body">
                    <div style={{ display: "flex", gap: "0.375rem", marginBottom: "0.375rem", flexWrap: "wrap" }}>
                      <StatusBadge status={alert.severity as "urgent" | "soon" | "routine"} />
                      <StatusBadge status={alert.status as "active" | "resolved" | "dismissed"} />
                      <span style={{ fontFamily: "monospace", fontSize: "0.8125rem", color: "var(--text-dim)", fontWeight: 600, lineHeight: "1.4" }}>
                        Score: {alert.anomalyScore}
                      </span>
                    </div>
                    {decision.summary_explanation && (
                      <div className="agent-feed-txt" style={{ fontSize: "0.9375rem", lineHeight: "1.6" }}>{decision.summary_explanation}</div>
                    )}
                    {flags.length > 0 && (
                      <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap", marginTop: "0.375rem" }}>
                        {flags.map((f: string) => (
                          <span key={f} className="badge badge-yellow" style={{ fontSize: "0.8125rem", lineHeight: "1.4" }}>{f}</span>
                        ))}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                      {alert.traceId && (
                        <button
                          className="agent-config-btn"
                          onClick={() => router.push(`/dashboard/anomaly/${alert.traceId}`)}
                        >
                          VIEW TRACE
                        </button>
                      )}
                      {alert.status === "active" && (
                        <>
                          <button
                            className="agent-config-btn"
                            onClick={() => updateAlertStatus(alert.id, "resolve")}
                          >
                            RESOLVE
                          </button>
                          <button
                            className="agent-config-btn"
                            onClick={() => updateAlertStatus(alert.id, "dismiss")}
                          >
                            DISMISS
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="agent-feed-time" style={{ fontSize: "0.8125rem", lineHeight: "1.4" }}>
                    {new Date(alert.createdAt).toLocaleString()}
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
