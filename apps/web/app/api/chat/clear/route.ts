import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCurrentUser } from "@/lib/auth";
import { clearConversation } from "@/lib/memory";

export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const user = await getCurrentUser();
    const handle = user?.handle ?? userId;
    await clearConversation("chat", handle);

    return NextResponse.json({ ok: true, message: "Chat history cleared." });
  } catch (err) {
    console.error("[POST /api/chat/clear]", err);
    return NextResponse.json(
      {
        error: "server_error",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
