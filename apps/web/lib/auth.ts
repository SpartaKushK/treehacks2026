import { auth } from "@clerk/nextjs/server";
import { prisma } from "./store";

/** Get the current Clerk user's primary Human agent. */
export async function getCurrentUser() {
  const { userId } = await auth();
  if (!userId) return null;
  return prisma.human.findFirst({ where: { clerkUserId: userId } });
}

/** Get all Human agents owned by the current Clerk user. */
export async function getUserAgents() {
  const { userId } = await auth();
  if (!userId) return [];
  return prisma.human.findMany({
    where: { clerkUserId: userId },
    include: { capabilities: true, policies: true },
  });
}

/** Verify the current Clerk user owns the given agent handle. */
export async function requireAgentOwnership(handle: string) {
  const { userId } = await auth();
  if (!userId) return null;
  return prisma.human.findFirst({
    where: { handle, clerkUserId: userId },
  });
}
