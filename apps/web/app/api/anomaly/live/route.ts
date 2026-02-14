import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/store";
import { ensureSeed } from "@/lib/ensureSeed";

export async function GET() {
  await ensureSeed();
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const agents = await prisma.human.findMany({
    where: { clerkUserId: userId },
    include: {
      healthMetrics: { orderBy: { date: "desc" }, take: 1 },
      anomalyAlerts: { where: { status: "active" } },
    },
  });

  const result = agents.map((agent) => {
    const latest = agent.healthMetrics[0] || null;

    // Simple anomaly score based on latest metrics
    let anomalyScore = 0;
    let urgency: "routine" | "soon" | "urgent" = "routine";

    if (latest) {
      // Simple scoring: low sleep + high symptoms = higher score
      if (latest.sleepHours < 5) anomalyScore += 30;
      else if (latest.sleepHours < 6) anomalyScore += 15;
      if (latest.symptomScore > 7) anomalyScore += 30;
      else if (latest.symptomScore > 5) anomalyScore += 15;
      if (latest.steps < 3000) anomalyScore += 20;
      else if (latest.steps < 5000) anomalyScore += 10;
      if (!latest.medAdherence) anomalyScore += 10;

      const thresholds = JSON.parse(agent.anomalyThresholdJson || "{}");
      const urgentThreshold = thresholds.urgent ?? 85;
      const soonThreshold = thresholds.soon ?? 70;

      if (anomalyScore >= urgentThreshold) urgency = "urgent";
      else if (anomalyScore >= soonThreshold) urgency = "soon";
    }

    return {
      handle: agent.handle,
      displayName: agent.displayName,
      avatarPhotoUrl: agent.avatarPhotoUrl,
      latestMetrics: latest
        ? {
            sleepHours: latest.sleepHours,
            steps: latest.steps,
            symptomScore: latest.symptomScore,
          }
        : null,
      anomalyScore,
      activeAlertCount: agent.anomalyAlerts.length,
      urgency,
    };
  });

  return NextResponse.json({ agents: result });
}
