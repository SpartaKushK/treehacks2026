"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";
import StatusBadge from "@/components/StatusBadge";

interface LiveMetrics {
  handle: string;
  displayName: string;
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

  // Filters
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

  return (
    <>
      <TopBar title="Anomaly Detection" />
      <div className="dashboard-content">
        {/* Live Dashboard */}
        <h2>Live Health Status</h2>
        {loading ? (
          <div style={{ padding: "2rem", textAlign: "center" }}><span className="spinner" /></div>
        ) : liveData.length === 0 ? (
          <div className="card" style={{ textAlign: "center", color: "var(--text-dim)", fontSize: "0.85rem" }}>
            No agents with health monitoring. Configure anomaly detection on an agent to see live data.
          </div>
        ) : (
          <div className="anomaly-live-grid">
            {liveData.map((agent) => (
              <div key={agent.handle} className={`anomaly-live-card anomaly-${agent.urgency}`}>
                <div className="anomaly-live-header">
                  <strong>{agent.displayName}</strong>
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

        {/* History Feed */}
        <div style={{ marginTop: "2rem" }}>
          <div className="section-header">
            <h2>Alert History</h2>
            <div className="row" style={{ gap: "0.5rem" }}>
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
            <div className="card" style={{ textAlign: "center", color: "var(--text-dim)", fontSize: "0.85rem" }}>
              No anomaly alerts found. Run an anomaly detection from the Demo page to generate alerts.
            </div>
          ) : (
            <div className="alert-list">
              {alerts.map((alert) => {
                const decision = JSON.parse(alert.decisionJson || "{}");
                const flags = JSON.parse(alert.flagsJson || "[]");
                return (
                  <div key={alert.id} className="alert-item">
                    <div className="alert-item-header">
                      <div className="row" style={{ gap: "0.5rem" }}>
                        <StatusBadge status={alert.severity as "urgent" | "soon" | "routine"} />
                        <StatusBadge status={alert.status as "active" | "resolved" | "dismissed"} />
                        <span style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>
                          Score: {alert.anomalyScore}
                        </span>
                      </div>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>
                        {new Date(alert.createdAt).toLocaleString()}
                      </span>
                    </div>
                    {decision.summary_explanation && (
                      <p style={{ fontSize: "0.8125rem", margin: "0.5rem 0", color: "var(--text)" }}>
                        {decision.summary_explanation}
                      </p>
                    )}
                    <div className="row" style={{ gap: "0.25rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
                      {flags.map((f: string) => (
                        <span key={f} className="badge badge-yellow" style={{ fontSize: "0.65rem" }}>{f}</span>
                      ))}
                    </div>
                    <div className="row" style={{ gap: "0.5rem" }}>
                      {alert.traceId && (
                        <button
                          className="btn btn-secondary"
                          style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem" }}
                          onClick={() => router.push(`/dashboard/anomaly/${alert.traceId}`)}
                        >
                          View Trace
                        </button>
                      )}
                      {alert.status === "active" && (
                        <>
                          <button
                            className="btn btn-secondary"
                            style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem" }}
                            onClick={() => updateAlertStatus(alert.id, "resolve")}
                          >
                            Resolve
                          </button>
                          <button
                            className="btn btn-secondary"
                            style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem" }}
                            onClick={() => updateAlertStatus(alert.id, "dismiss")}
                          >
                            Dismiss
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
