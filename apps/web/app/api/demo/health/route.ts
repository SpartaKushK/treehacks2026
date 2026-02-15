import { NextRequest, NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { ensureSeed } from "@/lib/ensureSeed";
import { prisma, getPrivateKey } from "@/lib/store";
import { signPayload, verifySignature } from "@/lib/crypto";
import { handleCapability } from "@/lib/people";
import { evaluatePolicy } from "@/lib/policy";
import { startTrace, addStep, finalizeTrace } from "@/lib/trace";
import { getPlanner, type Provider } from "@/lib/llm";
import type { HealthSummaryOutput } from "@people/shared";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  await ensureSeed();

  const url = new URL(req.url);
  const doctor = url.searchParams.get("doctor") || "dr_smith";
  const patient = url.searchParams.get("patient") || "pari";
  const provider = (url.searchParams.get("provider") || "claude") as Provider;
  const premium = url.searchParams.get("premium") !== "false"; // default true

  const planner = getPlanner(provider);
  const traceId = startTrace({
    provider,
    title: `Health summary: ${doctor} → ${patient}`,
  });

  try {
    // Registry lookups
    const doctorHuman = await prisma.human.findUnique({ where: { handle: doctor } });
    const patientHuman = await prisma.human.findUnique({ where: { handle: patient } });

    addStep(traceId, {
      actor: "orchestrator",
      event: "registry_lookup",
      ok: !!(doctorHuman && patientHuman),
      data: { doctor: doctorHuman?.handle, patient: patientHuman?.handle },
    });

    if (!doctorHuman || !patientHuman) {
      await finalizeTrace(traceId);
      return NextResponse.json({ error: "user_not_found", traceId }, { status: 404 });
    }

    // Sign request
    const doctorSk = getPrivateKey(doctor);
    if (!doctorSk) {
      await finalizeTrace(traceId);
      return NextResponse.json({ error: "no_private_key", traceId }, { status: 500 });
    }

    const scopes = premium ? ["medical_read", "premium"] : ["medical_read"];

    const invokePayload = {
      capability: "health_summary",
      scopes,
      input: { patientHandle: patient },
      nonce: uuid(),
      timestamp: Date.now(),
    };

    const sig = signPayload(invokePayload, doctorSk);
    addStep(traceId, {
      actor: doctor,
      event: "sign_payload",
      ok: true,
      data: { capability: "health_summary", signature: sig.slice(0, 16) + "..." },
    });

    // Verify
    const verified = verifySignature(invokePayload, sig, doctorHuman.publicKey);
    addStep(traceId, {
      actor: patient,
      event: "signature_verified",
      ok: verified,
      data: { verified },
    });

    // Policy check
    const policy = await evaluatePolicy(patient, doctor, "health_summary", scopes);
    addStep(traceId, {
      actor: patient,
      event: policy.allowed ? "policy_allow" : (policy.paymentRequired ? "payment_required" : "policy_deny"),
      ok: policy.allowed,
      data: policy,
    });

    if (!policy.allowed) {
      await finalizeTrace(traceId);

      if (policy.paymentRequired) {
        return NextResponse.json(
          {
            error: "payment_required",
            checkoutUrl: policy.checkoutUrl,
            priceCents: policy.priceCents,
            traceId,
          },
          { status: 402 }
        );
      }
      return NextResponse.json(
        { error: "policy_denied", reason: policy.reason, traceId },
        { status: 403 }
      );
    }

    // Invoke capability
    addStep(traceId, {
      actor: doctor,
      event: "invoke_request",
      ok: true,
      data: { target: patient, capability: "health_summary" },
    });

    const result = await handleCapability(patient, "health_summary", {
      patientHandle: patient,
    });

    addStep(traceId, {
      actor: patient,
      event: "capability_result",
      ok: result.ok,
      data: result.data,
    });

    // LLM explain
    if (result.ok) {
      const summary = result.data as HealthSummaryOutput;
      const explanation = await planner.explainHealthSummary(summary);

      addStep(traceId, {
        actor: doctor,
        event: "llm_plan",
        ok: true,
        data: explanation,
        provider,
      });

      summary.patientFriendlyText = explanation.patientFriendlyText;
      await finalizeTrace(traceId);

      return NextResponse.json({
        traceId,
        healthSummary: summary,
        provider,
      });
    }

    await finalizeTrace(traceId);
    return NextResponse.json({ error: "health_summary_failed", traceId }, { status: 500 });
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
