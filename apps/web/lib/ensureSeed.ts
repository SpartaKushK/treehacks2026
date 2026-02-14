import { prisma, setPrivateKey } from "./store";
import { toHex } from "./crypto";
import nacl from "tweetnacl";

let seeded = false;

/**
 * Ensure the database is seeded. Idempotent — safe to call on every request.
 * Seeds on first call if no humans exist. Regenerates private keys into memory.
 */
export async function ensureSeed() {
  if (seeded) return;

  const count = await prisma.human.count();
  if (count > 0) {
    // DB already seeded (e.g., from CLI), but we need runtime private keys.
    // Generate deterministic keys from handles (demo only).
    await rehydrateKeys();
    seeded = true;
    return;
  }

  // Need to seed from scratch
  const { seed } = await import("./seed");
  await seed();
  seeded = true;
}

async function rehydrateKeys() {
  // For demo: regenerate keypairs deterministically using handle as seed.
  // This allows the app to work after restart without persisted private keys.
  const humans = await prisma.human.findMany();
  for (const h of humans) {
    const seedBytes = new TextEncoder().encode(
      h.handle.padEnd(32, "\0")
    );
    const kp = nacl.sign.keyPair.fromSeed(seedBytes);

    // Update public key in DB to match regenerated keypair
    await prisma.human.update({
      where: { id: h.id },
      data: { publicKey: toHex(kp.publicKey) },
    });

    setPrivateKey(h.handle, kp.secretKey);
  }
}
