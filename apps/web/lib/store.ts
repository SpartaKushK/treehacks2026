import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/* ── In-memory nonce cache (per caller) ── */
const nonceCache = new Map<string, Set<string>>();

export function hasNonce(caller: string, nonce: string): boolean {
  return nonceCache.get(caller)?.has(nonce) ?? false;
}

export function addNonce(caller: string, nonce: string): void {
  if (!nonceCache.has(caller)) nonceCache.set(caller, new Set());
  nonceCache.get(caller)!.add(nonce);
}

/* ── In-memory private key store (demo only) ── */
const privateKeys = new Map<string, Uint8Array>();

export function setPrivateKey(handle: string, sk: Uint8Array): void {
  privateKeys.set(handle, sk);
}

export function getPrivateKey(handle: string): Uint8Array | undefined {
  return privateKeys.get(handle);
}
