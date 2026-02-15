/**
 * Health Agent — Sub-agent for health anomaly analysis
 *
 * Responsible for:
 * - Analyzing health anomalies from wearable data
 * - Determining urgency and severity
 * - Deciding whether patients should contact clinic
 * - Providing health summaries
 *
 * Memory scope: "health_anomaly" per user
 */

import { Agent } from "./base/Agent";
import type { AgentConfig, AgentContext, AgentResult } from "./base/types";
import { handleHealthAnomalyAlert } from "../capabilities/healthAnomalyAlert";
import { handleCapability } from "../people";
import { addStep } from "../trace";
import { extractUserHandle } from "./base/utils";

export class HealthAgent extends Agent {
  constructor(config?: Partial<AgentConfig>) {
    const fullConfig: AgentConfig = {
      agentType: "health_anomaly",
      systemPrompt: buildHealthAgentPrompt(),
      provider: config?.provider || "claude",
      ...config,
    };

    super(fullConfig, []);
  }

  /**
   * Main entry point — delegates to analyzeAnomaly by default.
   */
  async run(
    input: Record<string, unknown>,
    context: AgentContext,
  ): Promise<AgentResult> {
    return this.analyzeAnomaly(input, context);
  }

  /**
   * Analyze a health anomaly alert.
   * This is the primary method for health anomaly analysis.
   */
  async analyzeAnomaly(
    input: Record<string, unknown>,
    context: AgentContext,
  ): Promise<AgentResult> {
    const userHandle = extractUserHandle(input);

    addStep(context.traceId, {
      actor: "health_agent",
      event: "ANALYZE_START",
      ok: true,
      data: { userHandle, parentAgent: context.parentAgent },
    });

    // Call the existing health anomaly handler
    const result = await handleHealthAnomalyAlert(
      input,
      context.traceId,
      context.provider,
    );

    // Extract decision data
    const output = !result.ok
      ? { error: true, ...(result.data as Record<string, unknown>) }
      : { error: false, ...(result.data as { decision: Record<string, unknown> }).decision };

    // Save to health_anomaly agent's memory
    try {
      const userMessage = buildAnomalyUserMessage(input);
      const assistantMessage = buildAnomalyAssistantMessage(output);

      await this.saveToMemory(
        userHandle,
        userMessage,
        assistantMessage,
        {
          provider: context.provider,
          traceId: context.traceId,
          parentAgent: context.parentAgent,
        },
      );

      // Also save as tool interaction for detailed tracking
      await this.saveToolToMemory(
        userHandle,
        "analyze_anomaly",
        input,
        output,
      );
    } catch (e) {
      console.warn("[HealthAgent] Failed to save to memory:", e);
    }

    addStep(context.traceId, {
      actor: "health_agent",
      event: "ANALYZE_COMPLETE",
      ok: result.ok,
      data: {
        urgency: output.urgency,
        should_contact_clinic: output.should_contact_clinic,
      },
    });

    return {
      ok: result.ok,
      data: output,
      traceId: context.traceId,
    };
  }

  /**
   * Get a 30-day health summary for a patient.
   * Useful for providing context before making triage decisions.
   */
  async getHealthSummary(
    input: Record<string, unknown>,
    context: AgentContext,
  ): Promise<AgentResult> {
    const userHandle = extractUserHandle(input);

    addStep(context.traceId, {
      actor: "health_agent",
      event: "SUMMARY_START",
      ok: true,
      data: { userHandle },
    });

    // Call the existing health summary handler
    const result = await handleCapability(
      userHandle,
      "health_summary",
      { patientHandle: userHandle },
    );

    const output = !result.ok
      ? { error: true, ...(result.data as Record<string, unknown>) }
      : { error: false, ...(result.data as Record<string, unknown>) };

    // Save to health_anomaly agent's memory
    try {
      const userMessage = `Get health summary for the past 30 days.`;
      const assistantMessage = buildSummaryAssistantMessage(output);

      await this.saveToMemory(
        userHandle,
        userMessage,
        assistantMessage,
        {
          provider: context.provider,
          traceId: context.traceId,
        },
      );

      // Also save as tool interaction
      await this.saveToolToMemory(
        userHandle,
        "get_health_summary",
        input,
        output,
      );
    } catch (e) {
      console.warn("[HealthAgent] Failed to save summary to memory:", e);
    }

    addStep(context.traceId, {
      actor: "health_agent",
      event: "SUMMARY_COMPLETE",
      ok: result.ok,
      data: output,
    });

    return {
      ok: result.ok,
      data: output,
      traceId: context.traceId,
    };
  }
}

/* ------------------------------------------------------------------ */
/*  Helper Functions                                                   */
/* ------------------------------------------------------------------ */

function buildHealthAgentPrompt(): string {
  return `You are a Health Agent specialized in analyzing wearable health data and health anomalies.

Your responsibilities:
- Analyze health anomalies from wearable devices
- Evaluate severity and urgency of health alerts
- Decide whether patients should contact a clinic
- Provide health summaries and trends
- Ask follow-up questions to gather more context

You are NOT a doctor. You do NOT diagnose conditions. You assess anomalies and provide recommendations for clinical follow-up when needed.

Urgency guidelines:
- urgent: anomaly_score >= 85 OR multiple concerning flags (e.g., SLEEP_DROP + RHR_SPIKE)
- soon: anomaly_score >= 70 OR single concerning flag
- routine: anomaly_score < 70 AND no critical flags

Always be cautious and err on the side of recommending clinical follow-up when uncertain.`;
}

function buildAnomalyUserMessage(input: Record<string, unknown>): string {
  const anomalyScore = input.anomaly_score || "unknown";
  const flags = Array.isArray(input.flags) ? input.flags.join(", ") : "none";
  const date = input.date || new Date().toISOString().split("T")[0];

  return `New health anomaly alert received:
- Date: ${date}
- Anomaly score: ${anomalyScore}/100
- Flags: ${flags}
- Full data: ${JSON.stringify(input, null, 2)}`;
}

function buildAnomalyAssistantMessage(output: Record<string, unknown>): string {
  if (output.error) {
    return `Error analyzing anomaly: ${output.message || JSON.stringify(output)}`;
  }

  return `Analysis complete:
- Urgency: ${output.urgency || "unknown"}
- Contact clinic: ${output.should_contact_clinic ? "yes" : "no"}
- Summary: ${output.summary_explanation || "N/A"}
- Recommendation: ${output.recommended_next_step || "N/A"}
${output.clinic_message ? `- Clinic message: ${output.clinic_message}` : ""}`;
}

function buildSummaryAssistantMessage(output: Record<string, unknown>): string {
  if (output.error) {
    return `Error retrieving health summary: ${output.error || JSON.stringify(output)}`;
  }

  const rangeDays = output.rangeDays || 0;
  const sleepAvg = output.sleep?.avg || "N/A";
  const sleepTrend = output.sleep?.trend || "N/A";
  const adherencePct = output.medication?.adherencePct || "N/A";
  const notes = Array.isArray(output.notes) ? output.notes.join("; ") : "None";

  return `Health summary (${rangeDays} days):
- Sleep: ${sleepAvg}h average (trend: ${sleepTrend})
- Medication adherence: ${adherencePct}%
- Notes: ${notes}`;
}
