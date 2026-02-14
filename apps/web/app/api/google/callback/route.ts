import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/store";
import crypto from "crypto";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    return NextResponse.redirect(new URL("/dashboard/calendar?error=missing_params", req.url));
  }

  // Verify state HMAC
  const [handle, hmac] = state.split(":");
  const secret = process.env.CLERK_SECRET_KEY || "dev-secret";
  const expectedHmac = crypto.createHmac("sha256", secret).update(handle).digest("hex").slice(0, 16);

  if (hmac !== expectedHmac) {
    return NextResponse.redirect(new URL("/dashboard/calendar?error=invalid_state", req.url));
  }

  // Exchange code for tokens
  const clientId = process.env.GOOGLE_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || "http://localhost:3001/api/google/callback";

  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect(new URL("/dashboard/calendar?error=token_exchange_failed", req.url));
  }

  const tokenData = await tokenRes.json();

  const tokens = {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expiry: Date.now() + tokenData.expires_in * 1000,
  };

  // Store tokens on the human record
  await prisma.human.update({
    where: { handle },
    data: { googleCalendarTokens: JSON.stringify(tokens) },
  });

  return NextResponse.redirect(new URL(`/dashboard/agents/${handle}?calendar=connected`, req.url));
}
