import { v4 as uuid } from "uuid";
import { prisma, getPrivateKey } from "../store";
import { signPayload, verifySignature } from "../crypto";
import { handleCapability } from "../people";
import { evaluatePolicy } from "../policy";
import { startTrace, addStep, addChildCall, finalizeTrace } from "../trace";
import { ensureSeed } from "../ensureSeed";
import { lookupClinicalEvidence, type ClinicalEvidence } from "../clinical/evidenceService";
import type { HealthAnomalyAlert, PatientDecision, TriageRequest, TriageOutcome } from "@people/shared";

export interface PipelineResult {
  traceId: string;
  decision: PatientDecision;
  triageOutcome: TriageOutcome | null;
  evidence: ClinicalEvidence | null;
}

/**
 * Run the full anomaly → patient triage → doctor escalation pipeline.
 * Extracted from /api/demo/anomaly so it can be called from real uploads too.
 */
export async function triggerAnomalyPipeline(
  anomaly: HealthAnomalyAlert,
  userHandle: string,
  provider: "openai" | "claude" = "claude"
): Promise<PipelineResult> {
  await ensureSeed();

  const traceId = startTrace({
    provider,
    title: `Anomaly alert: ${userHandle} (score ${anomaly.anomaly_score})`,
  });

  const user = await prisma.human.findUnique({ where: { handle: userHandle } });
  addStep(traceId, {
    actor: "orchestrator",
    event: "registry_lookup",
    ok: !!user,
    data: { handle: userHandle, found: !!user },
  });

  if (!user) {
    await finalizeTrace(traceId);
    throw new Error(`User not found: ${userHandle}`);
  }

  // Sign payload as user invoking own anomaly_alert
  const sk = getPrivateKey(userHandle);
  if (!sk) {
    await finalizeTrace(traceId);
    throw new Error(`No private key for: ${userHandle}`);
  }

  const invokePayload = {
    capability: "health.anomaly_alert",
    scopes: ["health:write"],
    input: anomaly,
    nonce: uuid(),
    timestamp: Date.now(),
  };

  const sig = signPayload(invokePayload, sk);
  addStep(traceId, {
    actor: userHandle,
    event: "sign_payload",
    ok: true,
    data: { capability: "health.anomaly_alert" },
  });

  const verified = verifySignature(invokePayload, sig, user.publicKey);
  addStep(traceId, {
    actor: userHandle,
    event: "signature_verified",
    ok: verified,
    data: { verified },
  });

  // Policy check
  const policy = await evaluatePolicy(userHandle, userHandle, "health.anomaly_alert", ["health:write"]);
  addStep(traceId, {
    actor: userHandle,
    event: policy.allowed ? "policy_allow" : "policy_deny",
    ok: policy.allowed,
    data: policy,
  });

  // Call health.anomaly_alert handler
  const result = await handleCapability(userHandle, "health.anomaly_alert", anomaly, {
    traceId,
    provider,
  });

  if (!result.ok) {
    await finalizeTrace(traceId);
    throw new Error(`Anomaly handler failed: ${JSON.stringify(result.data)}`);
  }

  const { decision } = result.data as { decision: PatientDecision };

  // Lookup clinical evidence for the anomaly flags
  let evidence: ClinicalEvidence | null = null;
  try {
    addStep(traceId, {
      actor: "clinical_evidence_agent",
      event: "EVIDENCE_LOOKUP_START",
      ok: true,
      data: { flags: anomaly.flags },
    });

    evidence = await lookupClinicalEvidence({
      flags: anomaly.flags,
      metrics: anomaly.metrics as Record<string, unknown>,
    });

    addStep(traceId, {
      actor: "clinical_evidence_agent",
      event: "EVIDENCE_FOUND",
      ok: true,
      data: {
        studyCount: evidence.studies.length,
        guidelineCount: evidence.guidelines.length,
      },
    });
  } catch {
    addStep(traceId, {
      actor: "clinical_evidence_agent",
      event: "EVIDENCE_LOOKUP_FAILED",
      ok: false,
      data: {},
    });
  }

  // If escalation needed, call dr_smith's triage capability
  let triageOutcome: TriageOutcome | null = null;

  if (decision.should_contact_clinic) {
    addStep(traceId, {
      actor: userHandle,
      event: "ESCALATED_TO_RECEPTIONIST",
      ok: true,
      data: {
        target: "dr_smith",
        capability: "triage.intake_and_schedule",
        urgency: decision.urgency,
      },
    });

    const drSmith = await prisma.human.findUnique({ where: { handle: "dr_smith" } });
    addStep(traceId, {
      actor: "orchestrator",
      event: "registry_lookup",
      ok: !!drSmith,
      data: { handle: "dr_smith", found: !!drSmith },
    });

    if (drSmith) {
      const triageReq: TriageRequest = {
        patient_handle: userHandle,
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

      const triageSig = signPayload(triagePayload, sk);
      addStep(traceId, {
        actor: userHandle,
        event: "sign_payload",
        ok: true,
        data: { capability: "triage.intake_and_schedule", target: "dr_smith" },
      });

      const triageVerified = verifySignature(triagePayload, triageSig, user.publicKey);
      addStep(traceId, {
        actor: "dr_smith",
        event: "signature_verified",
        ok: triageVerified,
        data: { verified: triageVerified },
      });

      const triagePolicy = await evaluatePolicy("dr_smith", userHandle, "triage.intake_and_schedule", ["triage:write"]);
      addStep(traceId, {
        actor: "dr_smith",
        event: triagePolicy.allowed ? "policy_allow" : "policy_deny",
        ok: triagePolicy.allowed,
        data: triagePolicy,
      });

      if (triagePolicy.allowed) {
        addChildCall(traceId, {
          handle: "dr_smith",
          capability: "triage.intake_and_schedule",
          childTraceId: traceId,
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

  // Persist anomaly alert
  await prisma.anomalyAlert.create({
    data: {
      humanId: user.id,
      traceId,
      severity: decision.urgency,
      anomalyScore: anomaly.anomaly_score,
      flagsJson: JSON.stringify(anomaly.flags),
      decisionJson: JSON.stringify(decision),
      triageOutcomeJson: triageOutcome ? JSON.stringify(triageOutcome) : null,
      evidenceJson: evidence ? JSON.stringify(evidence) : null,
      status: "active",
    },
  });

  return { traceId, decision, triageOutcome, evidence };
}
