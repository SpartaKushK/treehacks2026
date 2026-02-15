import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCurrentUser } from "@/lib/auth";
import { getHistory } from "@/lib/memory";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const user = await getCurrentUser();
    const handle = user?.handle ?? userId;
    const history = await getHistory("health_review", handle);

    // Only return user/assistant messages for display
    const messages = history
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role, content: m.content }));

    return NextResponse.json({ messages });
  } catch (err) {
    console.error("[GET /api/chat/review/history]", err);
    return NextResponse.json(
      {
        error: "server_error",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
