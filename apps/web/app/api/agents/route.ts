import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma, setPrivateKey } from "@/lib/store";
import { ensureSeed } from "@/lib/ensureSeed";
import { toHex } from "@/lib/crypto";
import nacl from "tweetnacl";

export const dynamic = "force-dynamic";

/** GET /api/agents — list current user's agents + unclaimed demo agents */
export async function GET() {
  try {
    await ensureSeed();
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const agents = await prisma.human.findMany({
      where: { clerkUserId: userId },
      include: { capabilities: true, policies: true },
    });

    const unclaimed = await prisma.human.findMany({
      where: { clerkUserId: null },
      select: { handle: true, displayName: true },
    });

    return NextResponse.json({ agents, unclaimed });
  } catch (err) {
    console.error("[GET /api/agents]", err);
    return NextResponse.json(
      { error: "server_error", message: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/** POST /api/agents — create new agent or claim existing one */
export async function POST(req: NextRequest) {
  await ensureSeed();
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const { handle, displayName, claim, heygenAvatarId, avatarPhotoUrl } = body;

  if (!handle) return NextResponse.json({ error: "handle_required" }, { status: 400 });

  // Claim an existing unclaimed agent
  if (claim) {
    const existing = await prisma.human.findUnique({ where: { handle } });
    if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (existing.clerkUserId) return NextResponse.json({ error: "already_claimed" }, { status: 409 });

    await prisma.human.update({
      where: { handle },
      data: { clerkUserId: userId },
    });

    return NextResponse.json({ ok: true, handle });
  }

  // Create new agent
  const existing = await prisma.human.findUnique({ where: { handle } });
  if (existing) return NextResponse.json({ error: "handle_taken" }, { status: 409 });

  // Generate Ed25519 keypair deterministically from handle
  const seedBytes = new TextEncoder().encode(handle.padEnd(32, "\0"));
  const kp = nacl.sign.keyPair.fromSeed(seedBytes);
  setPrivateKey(handle, kp.secretKey);

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3001";

  const agent = await prisma.human.create({
    data: {
      handle,
      displayName: displayName || handle,
      publicKey: toHex(kp.publicKey),
      endpointUrl: `${baseUrl}/api/u/${handle}`,
      clerkUserId: userId,
      heygenAvatarId: heygenAvatarId || null,
      avatarPhotoUrl: avatarPhotoUrl || null,
    },
  });

  return NextResponse.json({ ok: true, agent });
}
