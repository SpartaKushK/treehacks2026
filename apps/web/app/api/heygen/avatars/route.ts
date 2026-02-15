import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { listAvatars } from "@/lib/heygen";

export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const avatars = await listAvatars();
  return NextResponse.json({ avatars });
}
