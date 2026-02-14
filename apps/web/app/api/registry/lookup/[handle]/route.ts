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
  });

  if (!human) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({
    handle: human.handle,
    endpointUrl: human.endpointUrl,
    publicKey: human.publicKey,
    displayName: human.displayName,
  });
}
