import { NextRequest, NextResponse } from "next/server";
import { RegisterBodySchema } from "@people/shared";
import { prisma } from "@/lib/store";
import { ensureSeed } from "@/lib/ensureSeed";

export async function POST(req: NextRequest) {
  await ensureSeed();

  const body = await req.json();
  const parsed = RegisterBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { handle, endpointUrl, publicKey, displayName } = parsed.data;

  await prisma.human.upsert({
    where: { handle },
    update: { endpointUrl, publicKey, displayName },
    create: { handle, endpointUrl, publicKey, displayName },
  });

  return NextResponse.json({ ok: true });
}
