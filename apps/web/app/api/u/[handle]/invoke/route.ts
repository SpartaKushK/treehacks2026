import { NextRequest, NextResponse } from "next/server";
import { InvokePayloadSchema } from "@people/shared";
import { prisma, hasNonce, addNonce } from "@/lib/store";
import { verifySignature } from "@/lib/crypto";
import { evaluatePolicy } from "@/lib/policy";
import { handleCapability } from "@/lib/people";
import { ensureSeed } from "@/lib/ensureSeed";

const FIVE_MINUTES_MS = 5 * 60 * 1000;

export async function POST(
  req: NextRequest,
  { params }: { params: { handle: string } }
) {
  await ensureSeed();

  const calleeHandle = params.handle;
  const callerHandle = req.headers.get("x-caller-handle");
  const signature = req.headers.get("x-signature");

  if (!callerHandle || !signature) {
    return NextResponse.json(
      { error: "missing_headers", detail: "X-Caller-Handle and X-Signature required" },
      { status: 400 }
    );
  }

  // Parse body
  const body = await req.json();
  const parsed = InvokePayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const payload = parsed.data;

  // 1) Lookup callee
  const callee = await prisma.human.findUnique({
    where: { handle: calleeHandle },
  });
  if (!callee) {
    return NextResponse.json({ error: "callee_not_found" }, { status: 404 });
  }

  // 2) Lookup caller
  const caller = await prisma.human.findUnique({
    where: { handle: callerHandle },
  });
  if (!caller) {
    return NextResponse.json({ error: "caller_not_found" }, { status: 404 });
  }

  // 3) Verify signature
  const sigPayload = {
    capability: payload.capability,
    scopes: payload.scopes,
    input: payload.input,
    nonce: payload.nonce,
    timestamp: payload.timestamp,
  };

  const verified = verifySignature(sigPayload, signature, caller.publicKey);
  if (!verified) {
    return NextResponse.json(
      { error: "signature_invalid", verified: false },
      { status: 401 }
    );
  }

  // 4) Reject stale timestamp
  if (Date.now() - payload.timestamp > FIVE_MINUTES_MS) {
    return NextResponse.json(
      { error: "timestamp_expired" },
      { status: 401 }
    );
  }

  // 5) Reject reused nonce
  if (hasNonce(callerHandle, payload.nonce)) {
    return NextResponse.json(
      { error: "nonce_reused" },
      { status: 401 }
    );
  }
  addNonce(callerHandle, payload.nonce);

  // 6) Evaluate policy
  const policyResult = await evaluatePolicy(
    calleeHandle,
    callerHandle,
    payload.capability,
    payload.scopes
  );

  if (!policyResult.allowed) {
    if (policyResult.paymentRequired) {
      return NextResponse.json(
        {
          error: "payment_required",
          checkoutUrl: policyResult.checkoutUrl,
          priceCents: policyResult.priceCents,
        },
        { status: 402 }
      );
    }
    return NextResponse.json(
      { error: "policy_denied", reason: policyResult.reason },
      { status: 403 }
    );
  }

  // 7) Route to capability handler
  const result = await handleCapability(
    calleeHandle,
    payload.capability,
    payload.input
  );

  return NextResponse.json({
    verified: true,
    ...result,
  });
}
