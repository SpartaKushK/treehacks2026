import {
  TriageRequestSchema,
  TriageOutcomeSchema,
  type TriageRequest,
  type TriageOutcome,
} from "@people/shared";
import { generateTriageOutcome } from "../triage/deterministic";
import { buildDoctorReceptionistPrompt } from "../personas/doctorReceptionist";
import { addStep } from "../trace";

/**
 * Triage handler — strictly evaluates urgency/severity, performs intake,
 * and scores the importance of health issues. Does NOT handle scheduling
 * or calendar operations — that is the scheduling agent's responsibility.
 */
export async function handleTriageIntakeAndSchedule(
  input: unknown,
  traceId: string,
  provider: "openai" | "claude"
): Promise<{ ok: boolean; data: { outcome: TriageOutcome } | { error: string } }> {
  const parsed = TriageRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, data: { error: `invalid_payload: ${parsed.error.message}` } };
  }

  const req = parsed.data;

  addStep(traceId, {
    actor: "dr_smith",
    event: "TRIAGE_REQUEST_RECEIVED",
    ok: true,
    data: {
      patient: req.patient_handle,
      urgency: req.urgency,
      flags: req.anomaly.flags,
    },
  });

  // Try LLM, fall back to deterministic
  let outcome: TriageOutcome;

  const apiKey = provider === "openai"
    ? process.env.OPENAI_API_KEY
    : process.env.ANTHROPIC_API_KEY;

  if (apiKey) {
    try {
      outcome = await callLLMForTriage(req, provider, apiKey);
    } catch {
      outcome = generateTriageOutcome(req);
    }
  } else {
    outcome = generateTriageOutcome(req);
  }

  // Log intake steps
  addStep(traceId, {
    actor: "dr_smith",
    event: "INTAKE_TURN_1",
    ok: true,
    data: {
      questions_asked: outcome.intake_questions_asked,
    },
  });

  addStep(traceId, {
    actor: req.patient_handle,
    event: "INTAKE_TURN_2",
    ok: true,
    data: {
      answers: outcome.intake_answers,
    },
  });

  addStep(traceId, {
    actor: "dr_smith",
    event: "TRIAGE_SCORING_COMPLETE",
    ok: true,
    data: {
      urgency: outcome.urgency,
      escalation_triggered: outcome.escalation_triggered,
      should_schedule: outcome.urgency === "urgent" || outcome.urgency === "soon",
    },
  });

  return { ok: true, data: { outcome } };
}

async function callLLMForTriage(
  req: TriageRequest,
  provider: "openai" | "claude",
  apiKey: string,
): Promise<TriageOutcome> {
  const systemPrompt = buildDoctorReceptionistPrompt(req);

  const userMsg = `Patient answers: ${JSON.stringify(req.patient_answers || {})}. Evaluate the urgency and perform intake scoring. Generate the triage outcome JSON.`;

  if (provider === "openai") {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMsg },
        ],
        max_tokens: 600,
      }),
    });
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (content) {
      return TriageOutcomeSchema.parse(JSON.parse(content));
    }
  } else {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 600,
        system: systemPrompt,
        messages: [{ role: "user", content: userMsg }],
      }),
    });
    const data = await res.json();
    const text = data.content?.[0]?.type === "text" ? data.content[0].text : null;
    if (text) {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return TriageOutcomeSchema.parse(JSON.parse(jsonMatch[0]));
      }
    }
  }

  return generateTriageOutcome(req);
}
