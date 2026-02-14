import { NextRequest, NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { ensureSeed } from "@/lib/ensureSeed";
import { prisma, getPrivateKey } from "@/lib/store";
import { signPayload, verifySignature } from "@/lib/crypto";
import { handleCapability } from "@/lib/people";
import { evaluatePolicy } from "@/lib/policy";
import { startTrace, addStep, addChildCall, finalizeTrace } from "@/lib/trace";
import type { Provider } from "@/lib/llm";
import type { HealthAnomalyAlert, PatientDecision, TriageRequest, TriageOutcome } from "@people/shared";

export async function GET(req: NextRequest) {
  await ensureSeed();

  const url = new URL(req.url);
  const severity = url.searchParams.get("severity") || "severe";
  const provider = (url.searchParams.get("provider") || "claude") as Provider;

  const traceId = startTrace({
    provider,
    title: `Anomaly alert: pari (${severity})`,
  });

  try {
    // Build sample anomaly payload
    const anomaly: HealthAnomalyAlert = severity === "severe"
      ? {
          user_handle: "pari",
          date: new Date().toISOString().split("T")[0],
          baseline_window_days: 28,
          metrics: { sleep_hours: 4.2, resting_hr_bpm: 88, steps: 2100, hrv_ms: 22 },
          baseline: { sleep_mean: 7.1, sleep_std: 0.6, rhr_mean: 62, rhr_std: 3, steps_mean: 7500, steps_std: 1200 },
          flags: ["SLEEP_DROP", "RHR_SPIKE", "STEPS_DROP", "HRV_DROP"],
          anomaly_score: 92,
          freeform_context: "Feeling very tired and heart racing since yesterday.",
        }
      : {
          user_handle: "pari",
          date: new Date().toISOString().split("T")[0],
          baseline_window_days: 28,
          metrics: { sleep_hours: 5.8, resting_hr_bpm: 68, steps: 5200 },
          baseline: { sleep_mean: 7.1, sleep_std: 0.6, rhr_mean: 62, rhr_std: 3, steps_mean: 7500, steps_std: 1200 },
          flags: ["SLEEP_DROP"],
          anomaly_score: 55,
        };

    // Registry lookup
    const pari = await prisma.human.findUnique({ where: { handle: "pari" } });
    addStep(traceId, {
      actor: "orchestrator",
      event: "registry_lookup",
      ok: !!pari,
      data: { handle: "pari", found: !!pari },
    });

    if (!pari) {
      await finalizeTrace(traceId);
      return NextResponse.json({ error: "user_not_found", traceId }, { status: 404 });
    }

    // Sign payload for pari invoking own anomaly_alert
    const pariSk = getPrivateKey("pari");
    if (!pariSk) {
      await finalizeTrace(traceId);
      return NextResponse.json({ error: "no_private_key", traceId }, { status: 500 });
    }

    const invokePayload = {
      capability: "health.anomaly_alert",
      scopes: ["health:write"],
      input: anomaly,
      nonce: uuid(),
      timestamp: Date.now(),
    };

    const sig = signPayload(invokePayload, pariSk);
    addStep(traceId, {
      actor: "pari",
      event: "sign_payload",
      ok: true,
      data: { capability: "health.anomaly_alert" },
    });

    const verified = verifySignature(invokePayload, sig, pari.publicKey);
    addStep(traceId, {
      actor: "pari",
      event: "signature_verified",
      ok: verified,
      data: { verified },
    });

    // Policy check
    const policy = await evaluatePolicy("pari", "pari", "health.anomaly_alert", ["health:write"]);
    addStep(traceId, {
      actor: "pari",
      event: policy.allowed ? "policy_allow" : "policy_deny",
      ok: policy.allowed,
      data: policy,
    });

    // Call health.anomaly_alert handler
    const result = await handleCapability("pari", "health.anomaly_alert", anomaly, {
      traceId,
      provider,
    });

    if (!result.ok) {
      await finalizeTrace(traceId);
      return NextResponse.json({ error: "anomaly_handler_failed", traceId, detail: result.data }, { status: 500 });
    }

    const { decision } = result.data as { decision: PatientDecision };

    // If escalation needed, call dr_smith's triage capability
    let triageOutcome: TriageOutcome | null = null;

    if (decision.should_contact_clinic) {
      addStep(traceId, {
        actor: "pari",
        event: "ESCALATED_TO_RECEPTIONIST",
        ok: true,
        data: {
          target: "dr_smith",
          capability: "triage.intake_and_schedule",
          urgency: decision.urgency,
        },
      });

      // Registry lookup dr_smith
      const drSmith = await prisma.human.findUnique({ where: { handle: "dr_smith" } });
      addStep(traceId, {
        actor: "orchestrator",
        event: "registry_lookup",
        ok: !!drSmith,
        data: { handle: "dr_smith", found: !!drSmith },
      });

      if (drSmith) {
        // Sign triage request as pari → dr_smith
        const triageReq: TriageRequest = {
          patient_handle: "pari",
          anomaly,
          urgency: decision.urgency,
          message: decision.clinic_message || `Anomaly alert: score ${anomaly.anomaly_score}`,
        };

        const triagePayload = {
          capability: "triage.intake_and_schedule",
          scopes: ["triage:write"],
          input: triageReq,
          nonce: uuid(),
          timestamp: Date.now(),
        };

        const triageSig = signPayload(triagePayload, pariSk);
        addStep(traceId, {
          actor: "pari",
          event: "sign_payload",
          ok: true,
          data: { capability: "triage.intake_and_schedule", target: "dr_smith" },
        });

        const triageVerified = verifySignature(triagePayload, triageSig, pari.publicKey);
        addStep(traceId, {
          actor: "dr_smith",
          event: "signature_verified",
          ok: triageVerified,
          data: { verified: triageVerified },
        });

        // Policy check on dr_smith
        const triagePolicy = await evaluatePolicy("dr_smith", "pari", "triage.intake_and_schedule", ["triage:write"]);
        addStep(traceId, {
          actor: "dr_smith",
          event: triagePolicy.allowed ? "policy_allow" : "policy_deny",
          ok: triagePolicy.allowed,
          data: triagePolicy,
        });

        if (triagePolicy.allowed) {
          // Record child call linkage
          addChildCall(traceId, {
            handle: "dr_smith",
            capability: "triage.intake_and_schedule",
            childTraceId: traceId, // same trace (inline)
          });

          const triageResult = await handleCapability(
            "dr_smith",
            "triage.intake_and_schedule",
            triageReq,
            { traceId, provider }
          );

          if (triageResult.ok) {
            triageOutcome = (triageResult.data as { outcome: TriageOutcome }).outcome;
          }
        }
      }
    }

    await finalizeTrace(traceId);

    return NextResponse.json({
      traceId,
      severity,
      provider,
      decision,
      triage_outcome: triageOutcome,
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
