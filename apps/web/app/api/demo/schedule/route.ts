import { NextRequest, NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { ensureSeed } from "@/lib/ensureSeed";
import { prisma, getPrivateKey } from "@/lib/store";
import { signPayload } from "@/lib/crypto";
import { handleCapability } from "@/lib/people";
import { evaluatePolicy } from "@/lib/policy";
import { verifySignature, toHex } from "@/lib/crypto";
import { startTrace, addStep, finalizeTrace } from "@/lib/trace";
import { getPlanner, type Provider } from "@/lib/llm";
import { canonicalJson } from "@people/shared";

export async function POST(req: NextRequest) {
  await ensureSeed();

  const url = new URL(req.url);
  const from = url.searchParams.get("from") || "pari";
  const to = url.searchParams.get("to") || "alex";
  const provider = (url.searchParams.get("provider") || "claude") as Provider;

  const planner = getPlanner(provider);
  const traceId = startTrace({ provider, title: `Schedule: ${from} → ${to}` });

  try {
    // Step 1: Registry lookups
    const fromHuman = await prisma.human.findUnique({ where: { handle: from } });
    const toHuman = await prisma.human.findUnique({ where: { handle: to } });

    addStep(traceId, {
      actor: "orchestrator",
      event: "registry_lookup",
      ok: !!(fromHuman && toHuman),
      data: { from: fromHuman?.handle, to: toHuman?.handle },
    });

    if (!fromHuman || !toHuman) {
      addStep(traceId, { actor: "orchestrator", event: "error", ok: false, data: { error: "user_not_found" } });
      await finalizeTrace(traceId);
      return NextResponse.json({ error: "user_not_found", traceId }, { status: 404 });
    }

    // Get next week time window for scheduling
    const nextMon = getNextMonday();
    const nextFri = new Date(nextMon);
    nextFri.setDate(nextFri.getDate() + 4);
    nextFri.setHours(18, 0, 0, 0);

    const timeWindow = {
      start: nextMon.toISOString(),
      end: nextFri.toISOString(),
    };

    const previousMessages: string[] = [];

    // ── Turn 0: Pari's agent proposes to Alex ──
    const proposeInput = {
      title: "Coffee",
      durationMins: 30,
      timeWindow,
      locationPrefs: ["near campus", "quiet"],
    };

    // Sign the payload
    const fromSk = getPrivateKey(from);
    if (!fromSk) {
      await finalizeTrace(traceId);
      return NextResponse.json({ error: "no_private_key", traceId }, { status: 500 });
    }

    const proposePayload = {
      capability: "schedule_propose",
      scopes: ["propose_meeting"],
      input: proposeInput,
      nonce: uuid(),
      timestamp: Date.now(),
    };

    const proposeSig = signPayload(proposePayload, fromSk);
    addStep(traceId, {
      actor: from,
      event: "sign_payload",
      ok: true,
      data: { capability: "schedule_propose", signature: proposeSig.slice(0, 16) + "..." },
    });

    // Verify signature (demonstrate it works)
    const sigVerified = verifySignature(proposePayload, proposeSig, fromHuman.publicKey);
    addStep(traceId, {
      actor: to,
      event: "signature_verified",
      ok: sigVerified,
      data: { verified: sigVerified, callerPublicKey: fromHuman.publicKey.slice(0, 16) + "..." },
    });

    // Policy check
    const policy1 = await evaluatePolicy(to, from, "schedule_propose", ["propose_meeting"]);
    addStep(traceId, {
      actor: to,
      event: policy1.allowed ? "policy_allow" : "policy_deny",
      ok: policy1.allowed,
      data: policy1,
    });

    // Invoke schedule_propose on Alex
    addStep(traceId, {
      actor: from,
      event: "invoke_request",
      ok: true,
      data: { target: to, capability: "schedule_propose" },
    });

    const proposeResult = await handleCapability(to, "schedule_propose", proposeInput);
    addStep(traceId, {
      actor: to,
      event: "capability_result",
      ok: proposeResult.ok,
      data: proposeResult.data,
    });

    const proposedSlots = (proposeResult.data as { proposedSlots: { start: string; end: string }[] }).proposedSlots || [];

    // LLM plans the proposal message
    const plan0 = await planner.planSchedulingTurn({
      turn: 0,
      proposal: proposeInput,
      availableSlots: proposedSlots,
      previousMessages,
    });
    addStep(traceId, {
      actor: from,
      event: "llm_plan",
      ok: true,
      data: plan0,
      provider,
    });
    previousMessages.push(plan0.message);

    // ── Turn 1: Alex's agent counters/accepts ──
    const counterInput = {
      proposedSlots: proposedSlots.slice(0, 2),
      durationMins: 30,
    };

    const alexSk = getPrivateKey(to);
    if (!alexSk) {
      await finalizeTrace(traceId);
      return NextResponse.json({ error: "no_private_key", traceId }, { status: 500 });
    }

    const counterPayload = {
      capability: "schedule_counter",
      scopes: ["propose_meeting"],
      input: counterInput,
      nonce: uuid(),
      timestamp: Date.now(),
    };

    const counterSig = signPayload(counterPayload, alexSk);
    addStep(traceId, {
      actor: to,
      event: "sign_payload",
      ok: true,
      data: { capability: "schedule_counter" },
    });

    const sigVerified2 = verifySignature(counterPayload, counterSig, toHuman.publicKey);
    addStep(traceId, {
      actor: from,
      event: "signature_verified",
      ok: sigVerified2,
      data: { verified: sigVerified2 },
    });

    const policy2 = await evaluatePolicy(to, from, "schedule_counter", ["propose_meeting"]);
    addStep(traceId, {
      actor: from,
      event: policy2.allowed ? "policy_allow" : "policy_deny",
      ok: policy2.allowed,
    });

    // Alex counters via Pari's schedule_propose (reverse direction)
    const counterResult = await handleCapability(from, "schedule_propose", {
      title: "Coffee",
      durationMins: 30,
      timeWindow,
      locationPrefs: ["near campus"],
    });
    addStep(traceId, {
      actor: from,
      event: "capability_result",
      ok: counterResult.ok,
      data: counterResult.data,
    });

    const plan1 = await planner.planSchedulingTurn({
      turn: 1,
      proposal: proposeInput,
      availableSlots: proposedSlots,
      previousMessages,
    });
    addStep(traceId, {
      actor: to,
      event: "llm_plan",
      ok: true,
      data: plan1,
      provider,
    });
    previousMessages.push(plan1.message);

    // ── Turn 2: Confirm booking ──
    const chosenSlot = proposedSlots[0];
    if (!chosenSlot) {
      addStep(traceId, { actor: "orchestrator", event: "error", ok: false, data: { error: "no_slots_available" } });
      await finalizeTrace(traceId);
      return NextResponse.json({ error: "no_slots_available", traceId }, { status: 409 });
    }

    const confirmInput = {
      chosenSlot,
      title: "Coffee",
      participants: [from, to],
    };

    const confirmPayload = {
      capability: "schedule_confirm",
      scopes: ["propose_meeting"],
      input: confirmInput,
      nonce: uuid(),
      timestamp: Date.now(),
    };

    const confirmSig = signPayload(confirmPayload, fromSk);
    addStep(traceId, {
      actor: from,
      event: "sign_payload",
      ok: true,
      data: { capability: "schedule_confirm" },
    });

    const sigVerified3 = verifySignature(confirmPayload, confirmSig, fromHuman.publicKey);
    addStep(traceId, {
      actor: to,
      event: "signature_verified",
      ok: sigVerified3,
      data: { verified: sigVerified3 },
    });

    const policy3 = await evaluatePolicy(to, from, "schedule_confirm", ["propose_meeting"]);
    addStep(traceId, {
      actor: to,
      event: policy3.allowed ? "policy_allow" : "policy_deny",
      ok: policy3.allowed,
      data: policy3,
    });

    const plan2 = await planner.planSchedulingTurn({
      turn: 2,
      proposal: proposeInput,
      availableSlots: [chosenSlot],
      previousMessages,
    });
    addStep(traceId, {
      actor: from,
      event: "llm_plan",
      ok: true,
      data: plan2,
      provider,
    });

    // Confirm booking
    const confirmResult = await handleCapability(to, "schedule_confirm", confirmInput);
    addStep(traceId, {
      actor: to,
      event: "capability_result",
      ok: confirmResult.ok,
      data: confirmResult.data,
    });

    addStep(traceId, {
      actor: "orchestrator",
      event: "booking_confirmed",
      ok: true,
      data: confirmResult.data,
    });

    await finalizeTrace(traceId);

    return NextResponse.json({
      traceId,
      bookingId: (confirmResult.data as { bookingId: string }).bookingId,
      provider,
      messages: previousMessages,
      chosenSlot,
    });
  } catch (err) {
    addStep(traceId, {
      actor: "orchestrator",
      event: "error",
      ok: false,
      data: { error: String(err) },
    });
    await finalizeTrace(traceId);
    return NextResponse.json(
      { error: "orchestration_failed", traceId, detail: String(err) },
      { status: 500 }
    );
  }
}

function getNextMonday(): Date {
  const d = new Date();
  const day = d.getDay();
  const diff = ((8 - day) % 7) || 7;
  d.setDate(d.getDate() + diff);
  d.setHours(9, 0, 0, 0);
  return d;
}
