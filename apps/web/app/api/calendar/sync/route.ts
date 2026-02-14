import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/store";
import { syncCalendar } from "@/lib/google-calendar";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const { handle } = body;

  if (!handle) return NextResponse.json({ error: "handle_required" }, { status: 400 });

  const agent = await prisma.human.findFirst({
    where: { handle, clerkUserId: userId },
  });

  if (!agent) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (!agent.googleCalendarTokens) {
    return NextResponse.json({ error: "google_not_connected" }, { status: 400 });
  }

  await syncCalendar(agent.id);

  return NextResponse.json({ ok: true });
}
