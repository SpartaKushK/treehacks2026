import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/store";
import { ensureSeed } from "@/lib/ensureSeed";

/** GET /api/agents/[handle]/config — get full agent config */
export async function GET(
  _req: NextRequest,
  { params }: { params: { handle: string } }
) {
  await ensureSeed();
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const agent = await prisma.human.findFirst({
    where: { handle: params.handle, clerkUserId: userId },
    include: { capabilities: true, policies: true },
  });

  if (!agent) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json(agent);
}

/** PUT /api/agents/[handle]/config — update agent config */
export async function PUT(
  req: NextRequest,
  { params }: { params: { handle: string } }
) {
  await ensureSeed();
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const agent = await prisma.human.findFirst({
    where: { handle: params.handle, clerkUserId: userId },
  });

  if (!agent) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const body = await req.json();

  // Update human fields
  const updateData: Record<string, unknown> = {};
  if (body.displayName !== undefined) updateData.displayName = body.displayName;
  if (body.llmProvider !== undefined) updateData.llmProvider = body.llmProvider;
  if (body.personaPrompt !== undefined) updateData.personaPrompt = body.personaPrompt;
  if (body.anomalyThresholds !== undefined) {
    updateData.anomalyThresholdJson = JSON.stringify(body.anomalyThresholds);
  }
  if (body.heygenAvatarId !== undefined) {
    updateData.heygenAvatarId = body.heygenAvatarId;
    updateData.avatarPhotoUrl = body.avatarPhotoUrl || null;
  }
  // Doctor-specific fields
  if (body.agentType !== undefined) updateData.agentType = body.agentType;
  if (body.specialty !== undefined) updateData.specialty = body.specialty || null;
  if (body.clinicName !== undefined) updateData.clinicName = body.clinicName || null;
  if (body.doctorCalendarEmail !== undefined) updateData.doctorCalendarEmail = body.doctorCalendarEmail || null;

  if (Object.keys(updateData).length > 0) {
    await prisma.human.update({
      where: { id: agent.id },
      data: updateData,
    });
  }

  // Update capabilities if provided
  if (body.capabilities) {
    // Remove all existing and recreate
    await prisma.capability.deleteMany({ where: { humanId: agent.id } });
    if (body.capabilities.length > 0) {
      await prisma.capability.createMany({
        data: body.capabilities.map((c: { name: string; description: string }) => ({
          humanId: agent.id,
          name: c.name,
          description: c.description || c.name,
        })),
      });
    }
  }

  // Update policies if provided
  if (body.policies) {
    for (const p of body.policies) {
      const existing = await prisma.policy.findFirst({
        where: { humanId: agent.id, capabilityName: p.capabilityName },
      });

      const policyData = {
        allowedCallersJson: JSON.stringify(p.allowedCallers || ["*"]),
        requiredScopesJson: JSON.stringify(p.requiredScopes || []),
        paymentRequired: p.paymentRequired || false,
        priceCents: p.priceCents || 0,
      };

      if (existing) {
        await prisma.policy.update({
          where: { id: existing.id },
          data: policyData,
        });
      } else {
        await prisma.policy.create({
          data: {
            humanId: agent.id,
            capabilityName: p.capabilityName,
            ...policyData,
          },
        });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
