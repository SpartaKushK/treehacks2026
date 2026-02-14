import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/store";

export async function POST(
  _req: NextRequest,
  { params }: { params: { alertId: string } }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const alert = await prisma.anomalyAlert.findUnique({
    where: { id: params.alertId },
    include: { human: { select: { clerkUserId: true } } },
  });

  if (!alert || alert.human.clerkUserId !== userId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  await prisma.anomalyAlert.update({
    where: { id: params.alertId },
    data: { status: "resolved", resolvedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
