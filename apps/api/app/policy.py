"""Policy evaluation engine (ported from apps/web/lib/policy.ts)."""

from __future__ import annotations

import json
from dataclasses import dataclass, field

from .db import get_supabase


@dataclass
class PolicyResult:
    allowed: bool
    reason: str | None = None
    payment_required: bool = False
    price_cents: int = 0
    checkout_url: str | None = None


async def evaluate_policy(
    callee_handle: str,
    caller_handle: str,
    capability: str,
    scopes: list[str],
) -> PolicyResult:
    db = get_supabase()

    # Lookup callee
    res = db.table("humans").select("id").eq("handle", callee_handle).single().execute()
    if not res.data:
        return PolicyResult(allowed=False, reason="callee_not_found")

    callee_id = res.data["id"]

    # Find policy for this capability
    res = (
        db.table("policies")
        .select("*")
        .eq("human_id", callee_id)
        .eq("capability_name", capability)
        .limit(1)
        .execute()
    )

    if not res.data:
        # No policy = open access
        return PolicyResult(allowed=True)

    policy = res.data[0]

    # Check allowed callers
    allowed_callers: list[str] = json.loads(policy["allowed_callers_json"])
    if "*" not in allowed_callers and caller_handle not in allowed_callers:
        return PolicyResult(allowed=False, reason="caller_not_allowed")

    # Check required scopes
    required_scopes: list[str] = json.loads(policy["required_scopes_json"])
    missing = [s for s in required_scopes if s not in scopes]
    if missing:
        return PolicyResult(allowed=False, reason=f"missing_scopes: {', '.join(missing)}")

    # Check payment
    if policy["payment_required"] and "premium" not in scopes:
        return PolicyResult(
            allowed=False,
            payment_required=True,
            price_cents=policy["price_cents"],
            checkout_url=f"https://checkout.stripe.com/demo/pay?cap={capability}&price={policy['price_cents']}&handle={callee_handle}",
            reason="payment_required",
        )

    return PolicyResult(allowed=True)
