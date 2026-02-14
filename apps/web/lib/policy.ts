import { prisma } from "./store";

interface PolicyResult {
  allowed: boolean;
  reason?: string;
  paymentRequired?: boolean;
  priceCents?: number;
  checkoutUrl?: string;
}

export async function evaluatePolicy(
  calleeHandle: string,
  callerHandle: string,
  capability: string,
  scopes: string[]
): Promise<PolicyResult> {
  const callee = await prisma.human.findUnique({
    where: { handle: calleeHandle },
  });
  if (!callee) return { allowed: false, reason: "callee_not_found" };

  const policy = await prisma.policy.findFirst({
    where: { humanId: callee.id, capabilityName: capability },
  });

  // No policy = open access
  if (!policy) return { allowed: true };

  // Check allowed callers
  const allowedCallers: string[] = JSON.parse(policy.allowedCallersJson);
  if (!allowedCallers.includes("*") && !allowedCallers.includes(callerHandle)) {
    return { allowed: false, reason: "caller_not_allowed" };
  }

  // Check required scopes
  const requiredScopes: string[] = JSON.parse(policy.requiredScopesJson);
  const missingScopes = requiredScopes.filter((s) => !scopes.includes(s));
  if (missingScopes.length > 0) {
    return {
      allowed: false,
      reason: `missing_scopes: ${missingScopes.join(", ")}`,
    };
  }

  // Check payment
  if (policy.paymentRequired && !scopes.includes("premium")) {
    return {
      allowed: false,
      paymentRequired: true,
      priceCents: policy.priceCents,
      checkoutUrl: `https://checkout.stripe.com/demo/pay?cap=${capability}&price=${policy.priceCents}&handle=${calleeHandle}`,
      reason: "payment_required",
    };
  }

  return { allowed: true };
}
