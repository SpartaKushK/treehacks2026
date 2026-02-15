import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/store";
import { ensureSeed } from "@/lib/ensureSeed";

export async function GET(
  _req: NextRequest,
  { params }: { params: { handle: string } }
) {
  await ensureSeed();

  const human = await prisma.human.findUnique({
    where: { handle: params.handle },
    include: { capabilities: true, policies: true },
  });

  if (!human) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  type Cap = (typeof human.capabilities)[number];
  type Pol = (typeof human.policies)[number];
  return NextResponse.json({
    handle: human.handle,
    capabilities: human.capabilities.map((c: Cap) => ({
      name: c.name,
      description: c.description,
    })),
    policies: human.policies.map((p: Pol) => ({
      capabilityName: p.capabilityName,
      requiredScopes: JSON.parse(p.requiredScopesJson),
      paymentRequired: p.paymentRequired,
      priceCents: p.priceCents,
    })),
  });
}
