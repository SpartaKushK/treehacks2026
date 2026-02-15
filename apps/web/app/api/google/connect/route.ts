import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/store";
import crypto from "crypto";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.redirect(new URL("/sign-in", req.url));

  const url = new URL(req.url);
  const handle = url.searchParams.get("handle");
  if (!handle) return NextResponse.json({ error: "handle_required" }, { status: 400 });

  // Verify ownership
  const agent = await prisma.human.findFirst({
    where: { handle, clerkUserId: userId },
  });
  if (!agent) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Build state token (handle + HMAC for CSRF protection)
  const secret = process.env.CLERK_SECRET_KEY || "dev-secret";
  const hmac = crypto.createHmac("sha256", secret).update(handle).digest("hex").slice(0, 16);
  const state = `${handle}:${hmac}`;

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/api/google/callback";

  if (!clientId) {
    return NextResponse.json({ error: "GOOGLE_CLIENT_ID not configured" }, { status: 500 });
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events",
    access_type: "offline",
    prompt: "consent",
    state,
  });

  return NextResponse.redirect(`${GOOGLE_AUTH_URL}?${params}`);
}
