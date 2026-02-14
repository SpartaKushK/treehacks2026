import {
  HealthAnomalyAlertSchema,
  PatientDecisionSchema,
  type HealthAnomalyAlert,
  type PatientDecision,
} from "@people/shared";
import { generatePatientDecision } from "../triage/deterministic";
import { buildPatientHealthPrompt } from "../personas/patientHealth";
import { addStep } from "../trace";

export async function handleHealthAnomalyAlert(
  input: unknown,
  traceId: string,
  provider: "openai" | "claude"
): Promise<{ ok: boolean; data: { decision: PatientDecision } | { error: string } }> {
  // Validate input
  const parsed = HealthAnomalyAlertSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, data: { error: `invalid_payload: ${parsed.error.message}` } };
  }

  const anomaly = parsed.data;

  addStep(traceId, {
    actor: anomaly.user_handle,
    event: "HEALTH_ANOMALY_RECEIVED",
    ok: true,
    data: {
      flags: anomaly.flags,
      anomaly_score: anomaly.anomaly_score,
      date: anomaly.date,
    },
  });

  // Try LLM, fall back to deterministic
  let decision: PatientDecision;

  const apiKey = provider === "openai"
    ? process.env.OPENAI_API_KEY
    : process.env.ANTHROPIC_API_KEY;

  if (apiKey) {
    try {
      decision = await callLLMForDecision(anomaly, provider, apiKey);
    } catch {
      decision = generatePatientDecision(anomaly);
    }
  } else {
    decision = generatePatientDecision(anomaly);
  }

  addStep(traceId, {
    actor: anomaly.user_handle,
    event: "PATIENT_DECISION",
    ok: true,
    provider,
    data: {
      urgency: decision.urgency,
      should_contact_clinic: decision.should_contact_clinic,
      summary: decision.summary_explanation,
    },
  });

  return { ok: true, data: { decision } };
}

async function callLLMForDecision(
  anomaly: HealthAnomalyAlert,
  provider: "openai" | "claude",
  apiKey: string
): Promise<PatientDecision> {
  const systemPrompt = buildPatientHealthPrompt(anomaly);

  if (provider === "openai") {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "Analyze this anomaly and produce the JSON decision." },
        ],
        max_tokens: 500,
      }),
    });
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (content) {
      const parsed = PatientDecisionSchema.parse(JSON.parse(content));
      return parsed;
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
        max_tokens: 500,
        system: systemPrompt,
        messages: [
          { role: "user", content: "Analyze this anomaly and produce the JSON decision." },
        ],
      }),
    });
    const data = await res.json();
    const text = data.content?.[0]?.type === "text" ? data.content[0].text : null;
    if (text) {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = PatientDecisionSchema.parse(JSON.parse(jsonMatch[0]));
        return parsed;
      }
    }
  }

  // Fallback
  return generatePatientDecision(anomaly);
}
