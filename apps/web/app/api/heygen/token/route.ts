import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createStreamingToken } from "@/lib/heygen";

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const token = await createStreamingToken();
  if (!token) {
    return NextResponse.json({ error: "failed_to_create_token" }, { status: 500 });
  }

  return NextResponse.json({ token });
}
