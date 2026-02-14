import nacl from "tweetnacl";
import { canonicalJson } from "@people/shared";

/** Convert Uint8Array to hex string */
export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Convert hex string to Uint8Array */
export function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/** Sign a payload object with Ed25519 secret key. Returns hex signature. */
export function signPayload(payload: unknown, secretKey: Uint8Array): string {
  const msg = new TextEncoder().encode(canonicalJson(payload));
  const sig = nacl.sign.detached(msg, secretKey);
  return toHex(sig);
}

/** Verify a hex signature against a payload and hex public key. */
export function verifySignature(
  payload: unknown,
  signatureHex: string,
  publicKeyHex: string
): boolean {
  try {
    const msg = new TextEncoder().encode(canonicalJson(payload));
    const sig = fromHex(signatureHex);
    const pk = fromHex(publicKeyHex);
    return nacl.sign.detached.verify(msg, sig, pk);
  } catch {
    return false;
  }
}

/** Generate a new Ed25519 keypair. Returns { publicKey, secretKey } as Uint8Arrays. */
export function generateKeypair() {
  return nacl.sign.keyPair();
}
