import { NextRequest, NextResponse } from "next/server";
import { prisma, setPrivateKey } from "@/lib/store";
import { toHex } from "@/lib/crypto";
import nacl from "tweetnacl";

/**
 * Clerk webhook handler — called when a new user is created.
 * Creates a Human agent linked to the Clerk user.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();

  // For hackathon: simple validation. In production, verify the Clerk webhook signature.
  const { type, data } = body;

  if (type !== "user.created") {
    return NextResponse.json({ ok: true });
  }

  const clerkUserId = data.id;
  const firstName = data.first_name || "";
  const lastName = data.last_name || "";
  const username = data.username || "";

  // Derive handle
  const handle = (username || `${firstName}${lastName}`.toLowerCase().replace(/[^a-z0-9]/g, "") || `user_${clerkUserId.slice(0, 8)}`).toLowerCase();

  // Check if handle exists
  const existing = await prisma.human.findUnique({ where: { handle } });
  if (existing) {
    // Link to existing unclaimed agent
    if (!existing.clerkUserId) {
      await prisma.human.update({
        where: { handle },
        data: { clerkUserId },
      });
    }
    return NextResponse.json({ ok: true, handle });
  }

  // Generate keypair deterministically from handle
  const seedBytes = new TextEncoder().encode(handle.padEnd(32, "\0"));
  const kp = nacl.sign.keyPair.fromSeed(seedBytes);
  setPrivateKey(handle, kp.secretKey);

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3001";

  await prisma.human.create({
    data: {
      handle,
      displayName: `${firstName} ${lastName}`.trim() || handle,
      publicKey: toHex(kp.publicKey),
      endpointUrl: `${baseUrl}/api/u/${handle}`,
      clerkUserId,
    },
  });

  return NextResponse.json({ ok: true, handle });
}
