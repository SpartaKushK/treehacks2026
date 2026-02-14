"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";
import StatusBadge from "@/components/StatusBadge";

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
      <TopBar title="Anomaly Detection" />
      <div className="dashboard-content">
        {/* Header */}
        <div style={{ marginBottom: "1.5rem" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>
            Anomaly Detection
          </h1>
          <p style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>
            Real-time health monitoring and alert management across your agents
          </p>
        </div>

        {/* Stats */}
        <div className="agent-stats">
          <div className="agent-stat">
            <div className="agent-stat-val">{liveData.length}</div>
            <div className="agent-stat-lbl">Monitored Agents</div>
          </div>
          <div className="agent-stat">
            <div className="agent-stat-val">{alerts.length}</div>
            <div className="agent-stat-lbl">Total Alerts</div>
          </div>
          <div className="agent-stat">
            <div className="agent-stat-val" style={{ color: activeCount > 0 ? "var(--yellow)" : "var(--text)" }}>
              {activeCount}
            </div>
            <div className="agent-stat-lbl">Active</div>
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
          <span className="agent-section-title">Live Health Status</span>
          <span className="agent-section-line" />
          <span className="agent-section-count">Auto-refreshes every 30s</span>
        </div>

        {loading ? (
          <div style={{ padding: "2rem", textAlign: "center" }}><span className="spinner" /></div>
        ) : liveData.length === 0 ? (
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
            No agents with health monitoring. Configure anomaly detection on an agent to see live data.
          </div>
        ) : (
          <div className="anomaly-live-grid">
            {liveData.map((agent) => (
              <div key={agent.handle} className={`anomaly-live-card anomaly-${agent.urgency}`}>
                <div className="anomaly-live-header">
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    {agent.avatarPhotoUrl ? (
                      <img src={agent.avatarPhotoUrl} alt={agent.displayName} style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }} />
                    ) : (
                      <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", fontWeight: 700 }}>
                        {agent.displayName[0].toUpperCase()}
                      </div>
                    )}
                    <strong>{agent.displayName}</strong>
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
                  <p style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>No metrics available</p>
                )}
                <div className="anomaly-live-footer">
                  <span style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>
                    Score: {agent.anomalyScore}
                  </span>
                  {agent.activeAlertCount > 0 && (
                    <span className="badge badge-red">{agent.activeAlertCount} active</span>
                  )}
                </div>
              </div>
            ))}
          </div>
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
        ) : alerts.length === 0 ? (
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
            No anomaly alerts found. Run an anomaly detection from the Demo page to generate alerts.
          </div>
        ) : (
          <div className="agent-feed">
            {alerts.map((alert) => {
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
                      <span style={{ fontFamily: "monospace", fontSize: "0.65rem", color: "var(--text-dim)" }}>
                        Score: {alert.anomalyScore}
                      </span>
                    </div>
                    {decision.summary_explanation && (
                      <div className="agent-feed-txt">{decision.summary_explanation}</div>
                    )}
                    {flags.length > 0 && (
                      <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap", marginTop: "0.375rem" }}>
                        {flags.map((f: string) => (
                          <span key={f} className="badge badge-yellow" style={{ fontSize: "0.6rem" }}>{f}</span>
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
                  <div className="agent-feed-time">
                    {new Date(alert.createdAt).toLocaleString()}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="agent-footer">PEOPLE API — TREEHACKS 2026</div>
      </div>
    </>
  );
}
