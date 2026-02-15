import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/store";
import { ensureSeed } from "@/lib/ensureSeed";

interface NormalizedRecord {
  id: string;
  type: "extraction" | "metric" | "alert";
  category: string;
  summary: string;
  date: string;
  data: Record<string, unknown>;
}

export async function GET(req: NextRequest) {
  await ensureSeed();
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const agents = await prisma.human.findMany({
    where: { clerkUserId: userId },
    select: { id: true },
  });
  const agentIds = agents.map((a) => a.id);

  if (agentIds.length === 0) {
    return NextResponse.json({ records: [] });
  }

  const typeFilter = req.nextUrl.searchParams.get("type");

  const [extractions, metrics, alerts] = await Promise.all([
    !typeFilter || typeFilter === "extraction"
      ? prisma.healthExtraction.findMany({
          where: { humanId: { in: agentIds } },
          orderBy: { extractedAt: "desc" },
        })
      : [],
    !typeFilter || typeFilter === "metric"
      ? prisma.healthMetric.findMany({
          where: { humanId: { in: agentIds } },
          orderBy: { date: "desc" },
        })
      : [],
    !typeFilter || typeFilter === "alert"
      ? prisma.anomalyAlert.findMany({
          where: { humanId: { in: agentIds } },
          orderBy: { createdAt: "desc" },
        })
      : [],
  ]);

  const records: NormalizedRecord[] = [];

  for (const e of extractions) {
    records.push({
      id: e.id,
      type: "extraction",
      category: e.category,
      summary: e.summary,
      date: e.extractedAt.toISOString(),
      data: {
        rawContent: e.rawContent,
        summary: e.summary,
        structuredData: e.structuredData,
        confidence: e.confidence,
        mentionedDate: e.mentionedDate,
        conversationId: e.conversationId,
      },
    });
  }

  for (const m of metrics) {
    records.push({
      id: m.id,
      type: "metric",
      category: "daily-health",
      summary: `Sleep ${m.sleepHours.toFixed(1)}h | ${m.steps.toLocaleString()} steps | Symptom ${m.symptomScore.toFixed(1)}`,
      date: m.date,
      data: {
        sleepHours: m.sleepHours,
        steps: m.steps,
        medAdherence: m.medAdherence,
        symptomScore: m.symptomScore,
      },
    });
  }

  for (const a of alerts) {
    const decision = JSON.parse(a.decisionJson || "{}");
    records.push({
      id: a.id,
      type: "alert",
      category: a.severity,
      summary: decision.summary_explanation || `Anomaly score: ${a.anomalyScore}`,
      date: a.createdAt.toISOString(),
      data: {
        anomalyScore: a.anomalyScore,
        severity: a.severity,
        status: a.status,
        flagsJson: a.flagsJson,
        decisionJson: a.decisionJson,
        evidenceJson: a.evidenceJson,
        triageOutcomeJson: a.triageOutcomeJson,
        traceId: a.traceId,
      },
    });
  }

  // Sort all records by date descending
  records.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return NextResponse.json({ records });
}
