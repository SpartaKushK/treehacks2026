import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/store";
import { ensureSeed } from "@/lib/ensureSeed";

export async function GET(req: NextRequest) {
  await ensureSeed();
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const handle = url.searchParams.get("handle");

  if (!handle) return NextResponse.json({ error: "handle_required" }, { status: 400 });

  const agent = await prisma.human.findFirst({
    where: { handle, clerkUserId: userId },
  });

  if (!agent) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const events = await prisma.calendarEvent.findMany({
    where: { humanId: agent.id },
    orderBy: { startTs: "asc" },
  });

  return NextResponse.json({ events });
}
