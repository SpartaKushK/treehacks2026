import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/store";
import { ensureSeed } from "@/lib/ensureSeed";
import { lookupClinicalEvidence } from "@/lib/clinical/evidenceService";

export const dynamic = "force-dynamic";

/**
 * GET /api/evidence
 *
 * Returns clinical evidence for a specific anomaly alert or the most recent active alert.
 *
 * Query params:
 *   - alertId: specific anomaly alert ID
 *   - live: if "true", returns evidence for the most recent active alert
 *   - flags: comma-separated anomaly flags to look up fresh evidence (e.g. "RHR_SPIKE,SLEEP_DROP")
 */
export async function GET(req: NextRequest) {
  await ensureSeed();

  const { searchParams } = new URL(req.url);
  const alertId = searchParams.get("alertId");
  const live = searchParams.get("live");
  const flagsParam = searchParams.get("flags");

  // Direct flags lookup (no database needed)
  if (flagsParam) {
    const flags = flagsParam.split(",").map((f) => f.trim()).filter(Boolean);
    const evidence = await lookupClinicalEvidence({ flags });
    return NextResponse.json({ evidence, source: "live_lookup" });
  }

  // Specific alert lookup
  if (alertId) {
    const alert = await prisma.anomalyAlert.findUnique({
      where: { id: alertId },
    });
    if (!alert) {
      return NextResponse.json({ error: "Alert not found" }, { status: 404 });
    }
    const evidence = alert.evidenceJson ? JSON.parse(alert.evidenceJson) : null;
    return NextResponse.json({
      evidence,
      alertId: alert.id,
      severity: alert.severity,
      flags: JSON.parse(alert.flagsJson),
      source: "stored",
    });
  }

  // Live: most recent active alert with evidence
  if (live === "true") {
    const alert = await prisma.anomalyAlert.findFirst({
      where: { status: "active" },
      orderBy: { createdAt: "desc" },
    });
    if (!alert) {
      return NextResponse.json({ evidence: null, source: "no_active_alerts" });
    }

    let evidence = alert.evidenceJson ? JSON.parse(alert.evidenceJson) : null;

    // If no stored evidence, try to look it up now
    if (!evidence) {
      const flags = JSON.parse(alert.flagsJson) as string[];
      if (flags.length > 0) {
        evidence = await lookupClinicalEvidence({ flags });
        // Store it for future use
        await prisma.anomalyAlert.update({
          where: { id: alert.id },
          data: { evidenceJson: JSON.stringify(evidence) },
        });
      }
    }

    return NextResponse.json({
      evidence,
      alertId: alert.id,
      severity: alert.severity,
      anomalyScore: alert.anomalyScore,
      flags: JSON.parse(alert.flagsJson),
      source: "active_alert",
    });
  }

  // Default: return evidence for all active alerts
  const alerts = await prisma.anomalyAlert.findMany({
    where: { status: "active" },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  const results = alerts.map((alert) => ({
    alertId: alert.id,
    severity: alert.severity,
    anomalyScore: alert.anomalyScore,
    flags: JSON.parse(alert.flagsJson),
    evidence: alert.evidenceJson ? JSON.parse(alert.evidenceJson) : null,
    createdAt: alert.createdAt,
  }));

  return NextResponse.json({ alerts: results });
}
