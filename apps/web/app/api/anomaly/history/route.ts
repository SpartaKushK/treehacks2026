import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/store";
import { ensureSeed } from "@/lib/ensureSeed";

export async function GET(req: NextRequest) {
  await ensureSeed();
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const severity = url.searchParams.get("severity");
  const status = url.searchParams.get("status");
  const traceIdFilter = url.searchParams.get("traceId");
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 50);

  // Get user's agent IDs
  const agents = await prisma.human.findMany({
    where: { clerkUserId: userId },
    select: { id: true, heygenAvatarId: true },
  });
  const agentIds = agents.map((a: { id: string; heygenAvatarId: string | null }) => a.id);
  const agentAvatarMap = new Map(
    agents.map((a: { id: string; heygenAvatarId: string | null }) => [a.id, a.heygenAvatarId])
  );

  if (agentIds.length === 0) {
    return NextResponse.json({ alerts: [], total: 0 });
  }

  const where: Record<string, unknown> = {
    humanId: { in: agentIds },
  };
  if (severity && severity !== "all") where.severity = severity;
  if (status && status !== "all") where.status = status;
  if (traceIdFilter) where.traceId = traceIdFilter;

  const [alerts, total] = await Promise.all([
    prisma.anomalyAlert.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.anomalyAlert.count({ where }),
  ]);

  const alertsWithAvatar = alerts.map(
    (a: { humanId: string; [k: string]: unknown }) => ({
      ...a,
      agentAvatarId: agentAvatarMap.get(a.humanId) || null,
    })
  );

  return NextResponse.json({ alerts: alertsWithAvatar, total, page, limit });
}
