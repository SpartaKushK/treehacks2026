/**
 * Health Agent — Sub-agent with composable health analysis tools
 *
 * The Secretary delegates health-related requests here. The HealthAgent
 * runs its own LLM tool-calling loop with six composable tools:
 *
 *   1. analyze_anomaly        → handleHealthAnomalyAlert
 *   2. get_health_summary     → handleCapability (health_summary)
 *   3. triage_patient         → handleTriageIntakeAndSchedule
 *   4. lookup_clinical_evidence → lookupClinicalEvidence
 *   5. get_health_metrics     → Prisma query on HealthMetric
 *   6. get_anomaly_history    → Prisma query on AnomalyAlert
 *
 * Supports both Anthropic (Claude) and OpenAI (GPT-4o-mini) backends.
 */

import { handleHealthAnomalyAlert } from "../capabilities/healthAnomalyAlert";
import { handleTriageIntakeAndSchedule } from "../capabilities/triageIntakeAndSchedule";
import { handleCapability } from "../people";
import { lookupClinicalEvidence } from "../clinical/evidenceService";
import { prisma } from "../store";
import { addStep } from "../trace";
import {
  saveInteraction,
  saveToolInteraction,
} from "../memory";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface HealthAgentInput {
  user_handle: string;
  request_type: "anomaly" | "summary" | "triage" | "evidence" | "general";
  /** Pass-through data — anomaly alert payload, triage args, flags, etc. */
  data?: Record<string, unknown>;
  /** Free-form message describing what the user wants */
  message?: string;
}

export interface HealthAgentResult {
  error: boolean;
  finalDecision: string;
  toolCallLog: ToolCallLogEntry[];
  turns: number;
}

interface ToolCallLogEntry {
  tool: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
}

interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

interface HealthAgentContext {
  traceId: string;
  provider: "openai" | "claude";
  /** Original trigger data — tools can use this to fill in missing fields */
  triggerData?: Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const MAX_TURNS = 8;

const HEALTH_AGENT_SYSTEM_PROMPT = `You are a Health Analysis Agent that evaluates patient health data and anomalies.

You have six tools:
1. **analyze_anomaly** — Evaluate wearable health data for anomalies (sleep, heart rate, steps, HRV)
2. **get_health_summary** — Get 30-day health trends (sleep, activity, medication adherence, symptoms)
3. **triage_patient** — Score urgency and determine if a clinic visit is needed
4. **lookup_clinical_evidence** — Search PubMed and clinical guidelines for supporting evidence
5. **get_health_metrics** — Query raw daily health metrics from the database
6. **get_anomaly_history** — Check past anomaly alerts and their status

## Workflow for health anomaly analysis
1. Use analyze_anomaly to evaluate the data
2. If urgent or concerning, use lookup_clinical_evidence for supporting evidence
3. If should_contact_clinic=true, use triage_patient to perform intake and urgency scoring
4. Use get_health_summary or get_health_metrics for additional historical context if needed

## Workflow for health summary requests
1. Use get_health_summary to get the 30-day overview
2. If concerning trends are found, optionally use get_anomaly_history to check recent alerts
3. Report findings clearly

## Workflow for clinical evidence requests
1. Use lookup_clinical_evidence with the relevant flags
2. Summarize findings in patient-friendly language

## Rules
- Always use tools — never fabricate health data or assessments
- You are NOT a doctor — provide analysis, not diagnoses
- Report findings clearly with supporting evidence
- If a tool returns an error, explain what happened and suggest next steps`;

/* ------------------------------------------------------------------ */
/*  Tool definitions (composable, each wraps an existing function)     */
/* ------------------------------------------------------------------ */

function buildTools(
  humanId: string,
  userHandle: string,
  ctx: HealthAgentContext,
): ToolDef[] {
  return [
    /* ---- 1. analyze_anomaly ---- */
    {
      name: "analyze_anomaly",
      description:
        "Analyze a health anomaly alert from a patient's wearable data. " +
        "Evaluates severity, determines urgency, and decides whether the " +
        "patient should contact a clinic. Returns a structured decision.",
      parameters: {
        type: "object",
        properties: {
          user_handle: {
            type: "string",
            description: "The patient's handle (e.g. 'pari')",
          },
          date: {
            type: "string",
            description: "ISO date of the anomaly (e.g. '2026-02-14')",
          },
          baseline_window_days: {
            type: "number",
            description: "Number of days used for the baseline window",
          },
          metrics: {
            type: "object",
            description: "Current readings from the wearable",
            properties: {
              sleep_hours: { type: "number" },
              resting_hr_bpm: { type: "number" },
              steps: { type: "number" },
              hrv_ms: { type: "number" },
            },
          },
          baseline: {
            type: "object",
            description: "Baseline statistics for comparison",
            properties: {
              sleep_mean: { type: "number" },
              sleep_std: { type: "number" },
              rhr_mean: { type: "number" },
              rhr_std: { type: "number" },
              steps_mean: { type: "number" },
              steps_std: { type: "number" },
            },
          },
          flags: {
            type: "array",
            items: { type: "string" },
            description:
              "List of anomaly flags (e.g. 'low_sleep', 'high_resting_hr')",
          },
          anomaly_score: {
            type: "number",
            description: "Anomaly score from 0-100 (higher = more anomalous)",
          },
          freeform_context: {
            type: "string",
            description: "Optional freeform context about the anomaly",
          },
        },
        required: [
          "user_handle",
          "date",
          "baseline_window_days",
          "metrics",
          "baseline",
          "flags",
          "anomaly_score",
        ],
      },
      async execute(args) {
        try {
          const result = await handleHealthAnomalyAlert(
            args,
            ctx.traceId,
            ctx.provider,
          );
          if (!result.ok) {
            return {
              error: true,
              ...(result.data as Record<string, unknown>),
            };
          }
          return {
            error: false,
            ...(result.data as { decision: Record<string, unknown> }).decision,
          };
        } catch (e) {
          console.error("[HealthAgent] analyze_anomaly error:", e);
          return {
            error: true,
            message: `Failed to analyze anomaly: ${e instanceof Error ? e.message : String(e)}`,
          };
        }
      },
    },

    /* ---- 2. get_health_summary ---- */
    {
      name: "get_health_summary",
      description:
        "Retrieve a 30-day health summary for a patient. Includes sleep, " +
        "activity, medication adherence, and symptom trends.",
      parameters: {
        type: "object",
        properties: {
          patient_handle: {
            type: "string",
            description: "The patient's handle (e.g. 'pari')",
          },
        },
        required: ["patient_handle"],
      },
      async execute(args) {
        try {
          const handle = (args.patient_handle as string) || userHandle;
          const result = await handleCapability(handle, "health_summary", {
            patientHandle: handle,
          });
          if (!result.ok) {
            return {
              error: true,
              ...(result.data as Record<string, unknown>),
            };
          }
          return {
            error: false,
            ...(result.data as Record<string, unknown>),
          };
        } catch (e) {
          console.error("[HealthAgent] get_health_summary error:", e);
          return {
            error: true,
            message: `Failed to get health summary: ${e instanceof Error ? e.message : String(e)}`,
          };
        }
      },
    },

    /* ---- 3. triage_patient ---- */
    {
      name: "triage_patient",
      description:
        "Evaluate and score the severity/urgency of a patient's health issues. " +
        "Performs intake questioning and determines whether the patient needs " +
        "to be seen. Does NOT handle scheduling.",
      parameters: {
        type: "object",
        properties: {
          patient_handle: {
            type: "string",
            description: "The patient's handle",
          },
          anomaly: {
            type: "object",
            description:
              "The original anomaly alert data (pass through from analyze_anomaly input)",
          },
          urgency: {
            type: "string",
            enum: ["routine", "soon", "urgent"],
            description: "Urgency level determined by the anomaly analysis",
          },
          message: {
            type: "string",
            description:
              "Message to the clinic describing why the patient needs to be seen",
          },
          patient_answers: {
            type: "object",
            description: "Optional pre-filled intake answers (key-value pairs)",
          },
        },
        required: ["patient_handle", "anomaly", "urgency", "message"],
      },
      async execute(args) {
        try {
          // Fill in anomaly from trigger data if missing
          if (
            !args.anomaly ||
            Object.keys(args.anomaly as Record<string, unknown>).length === 0
          ) {
            args.anomaly = ctx.triggerData ?? {};
          }
          const result = await handleTriageIntakeAndSchedule(
            args,
            ctx.traceId,
            ctx.provider,
          );
          if (!result.ok) {
            return {
              error: true,
              ...(result.data as Record<string, unknown>),
            };
          }
          return {
            error: false,
            ...(result.data as { outcome: Record<string, unknown> }).outcome,
          };
        } catch (e) {
          console.error("[HealthAgent] triage_patient error:", e);
          return {
            error: true,
            message: `Failed to triage patient: ${e instanceof Error ? e.message : String(e)}`,
          };
        }
      },
    },

    /* ---- 4. lookup_clinical_evidence ---- */
    {
      name: "lookup_clinical_evidence",
      description:
        "Search PubMed medical literature and clinical guidelines for evidence " +
        "relevant to the patient's health anomaly flags. Returns peer-reviewed " +
        "studies, clinical guidelines, and drug interaction data from the FDA.",
      parameters: {
        type: "object",
        properties: {
          flags: {
            type: "array",
            items: { type: "string" },
            description:
              "Anomaly flags from the health alert (e.g. ['RHR_SPIKE', 'SLEEP_DROP'])",
          },
          metrics: {
            type: "object",
            description: "Current health metrics from the wearable",
            properties: {
              sleep_hours: { type: "number" },
              resting_hr_bpm: { type: "number" },
              steps: { type: "number" },
              hrv_ms: { type: "number" },
            },
          },
          medications: {
            type: "array",
            items: { type: "string" },
            description:
              "Optional list of patient medications to check for drug interactions",
          },
        },
        required: ["flags"],
      },
      async execute(args) {
        try {
          const flags = (args.flags as string[]) || [];
          const metrics = (args.metrics as Record<string, unknown>) || {};
          const medications = (args.medications as string[]) || [];

          const evidence = await lookupClinicalEvidence({
            flags,
            metrics,
            medications,
          });
          return {
            error: false,
            studies: evidence.studies.map((s) => ({
              title: s.title,
              authors: s.authors,
              pmid: s.pmid,
              url: s.url,
              journal: s.journal,
              year: s.year,
            })),
            guidelines: evidence.guidelines.map((g) => ({
              condition: g.condition,
              recommendation: g.recommendation,
              source: g.source,
            })),
            drug_interactions: evidence.drugInteractions,
            patient_summary: evidence.patientFriendlySummary,
          };
        } catch (e) {
          console.error("[HealthAgent] lookup_clinical_evidence error:", e);
          return {
            error: true,
            message: `Failed to lookup clinical evidence: ${e instanceof Error ? e.message : String(e)}`,
          };
        }
      },
    },

    /* ---- 5. get_health_metrics (NEW) ---- */
    {
      name: "get_health_metrics",
      description:
        "Query raw daily health metrics from the database. Returns an array " +
        "of daily records with sleep hours, steps, medication adherence, and " +
        "symptom scores. Useful for detailed historical analysis.",
      parameters: {
        type: "object",
        properties: {
          user_handle: {
            type: "string",
            description: "The patient's handle",
          },
          days_back: {
            type: "number",
            description: "Number of days of history to retrieve (default 30)",
          },
        },
        required: ["user_handle"],
      },
      async execute(args) {
        try {
          const handle = (args.user_handle as string) || userHandle;
          const daysBack = (args.days_back as number) || 30;

          const human = await prisma.human.findUnique({
            where: { handle },
            select: { id: true },
          });
          if (!human) {
            return { error: true, message: `User '${handle}' not found.` };
          }

          const metrics = await prisma.healthMetric.findMany({
            where: { humanId: human.id },
            orderBy: { date: "desc" },
            take: daysBack,
          });

          return {
            error: false,
            metrics: metrics.map((m) => ({
              date: m.date,
              sleepHours: m.sleepHours,
              steps: m.steps,
              medAdherence: m.medAdherence,
              symptomScore: m.symptomScore,
            })),
            count: metrics.length,
            message: `Retrieved ${metrics.length} daily health records for '${handle}'.`,
          };
        } catch (e) {
          console.error("[HealthAgent] get_health_metrics error:", e);
          return {
            error: true,
            message: `Failed to get health metrics: ${e instanceof Error ? e.message : String(e)}`,
          };
        }
      },
    },

    /* ---- 6. get_anomaly_history (NEW) ---- */
    {
      name: "get_anomaly_history",
      description:
        "Query past anomaly alerts for a patient. Returns an array of alerts " +
        "with severity, anomaly score, flags, status, and dates. Useful for " +
        "understanding patterns and whether issues are recurring.",
      parameters: {
        type: "object",
        properties: {
          user_handle: {
            type: "string",
            description: "The patient's handle",
          },
          status: {
            type: "string",
            enum: ["active", "resolved", "all"],
            description:
              "Filter by alert status: 'active', 'resolved', or 'all' (default 'all')",
          },
          limit: {
            type: "number",
            description: "Maximum number of alerts to return (default 10)",
          },
        },
        required: ["user_handle"],
      },
      async execute(args) {
        try {
          const handle = (args.user_handle as string) || userHandle;
          const status = (args.status as string) || "all";
          const limit = (args.limit as number) || 10;

          const human = await prisma.human.findUnique({
            where: { handle },
            select: { id: true },
          });
          if (!human) {
            return { error: true, message: `User '${handle}' not found.` };
          }

          const where: Record<string, unknown> = { humanId: human.id };
          if (status !== "all") {
            where.status = status;
          }

          const alerts = await prisma.anomalyAlert.findMany({
            where,
            orderBy: { createdAt: "desc" },
            take: limit,
          });

          return {
            error: false,
            alerts: alerts.map((a) => ({
              id: a.id,
              severity: a.severity,
              anomalyScore: a.anomalyScore,
              flags: JSON.parse(a.flagsJson),
              status: a.status,
              createdAt: a.createdAt.toISOString(),
              resolvedAt: a.resolvedAt?.toISOString() ?? null,
            })),
            count: alerts.length,
            message: `Found ${alerts.length} anomaly alerts for '${handle}'.`,
          };
        } catch (e) {
          console.error("[HealthAgent] get_anomaly_history error:", e);
          return {
            error: true,
            message: `Failed to get anomaly history: ${e instanceof Error ? e.message : String(e)}`,
          };
        }
      },
    },
  ];
}

/* ------------------------------------------------------------------ */
/*  Main entry point                                                   */
/* ------------------------------------------------------------------ */

/**
 * Run the Health Agent. Resolves the user, builds health tools
 * scoped to that user, then runs an LLM tool-calling loop.
 */
export async function runHealthAgent(
  input: HealthAgentInput,
  ctx: HealthAgentContext,
): Promise<HealthAgentResult> {
  const { user_handle: handle, request_type, data, message } = input;

  // 1. Resolve user
  let human: { id: string } | null = null;
  try {
    human = await prisma.human.findUnique({
      where: { handle },
      select: { id: true },
    });
  } catch (e) {
    console.error("[HealthAgent] DB error resolving user:", e);
    return {
      error: true,
      finalDecision: `Database error resolving user '${handle}': ${e instanceof Error ? e.message : String(e)}`,
      toolCallLog: [],
      turns: 0,
    };
  }

  if (!human) {
    return {
      error: true,
      finalDecision: `User '${handle}' not found.`,
      toolCallLog: [],
      turns: 0,
    };
  }

  addStep(ctx.traceId, {
    actor: "health_agent",
    event: "HEALTH_AGENT_START",
    ok: true,
    data: { handle, request_type },
  });

  // 2. Build tools scoped to this user
  const tools = buildTools(human.id, handle, ctx);

  // 3. Build the user message for the LLM
  const userMessage = buildUserMessage(input);

  // 4. Run the agentic loop
  const toolCallLog: ToolCallLogEntry[] = [];

  const provider = ctx.provider;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  let result: { finalDecision: string; turns: number };

  try {
    if (anthropicKey) {
      // Prefer Anthropic — more reliable rate limits and better tool-use support
      result = await runAnthropicLoop(userMessage, tools, toolCallLog, ctx);
    } else if (openaiKey) {
      result = await runOpenAILoop(userMessage, tools, toolCallLog, ctx);
    } else {
      // No API key — deterministic fallback
      result = await runDeterministicFallback(input, tools, toolCallLog, ctx);
    }
  } catch (e) {
    console.error("[HealthAgent] LLM loop error:", e);
    result = {
      finalDecision:
        toolCallLog.length > 0
          ? buildFallbackSummary(toolCallLog)
          : `Health Agent error: ${e instanceof Error ? e.message : String(e)}`,
      turns: 0,
    };
  }

  // 5. Save to health_anomaly memory
  try {
    await saveInteraction(
      "health_anomaly",
      handle,
      userMessage,
      result.finalDecision,
      {
        provider: ctx.provider,
        traceId: ctx.traceId,
        turns: result.turns,
        toolCallsCount: toolCallLog.length,
      },
    );
    for (const tc of toolCallLog) {
      await saveToolInteraction(
        "health_anomaly",
        handle,
        tc.tool,
        tc.args,
        tc.result,
      );
    }
  } catch (e) {
    console.warn("[HealthAgent] Failed to save memory:", e);
  }

  addStep(ctx.traceId, {
    actor: "health_agent",
    event: "HEALTH_AGENT_COMPLETE",
    ok: !result.finalDecision.startsWith("Health Agent error"),
    data: {
      finalDecision: result.finalDecision.slice(0, 300),
      turns: result.turns,
      toolCalls: toolCallLog.length,
    },
  });

  return {
    error: false,
    finalDecision: result.finalDecision,
    toolCallLog,
    turns: result.turns,
  };
}

/* ------------------------------------------------------------------ */
/*  Build user message from input                                      */
/* ------------------------------------------------------------------ */

function buildUserMessage(input: HealthAgentInput): string {
  const { user_handle, request_type, data, message } = input;
  const parts: string[] = [];

  switch (request_type) {
    case "anomaly":
      parts.push(
        `Analyze a health anomaly for patient "${user_handle}".`,
        `Use analyze_anomaly with the following data, then follow up with clinical evidence and triage if needed.`,
      );
      if (data) {
        parts.push(`\nAnomaly data:\n${JSON.stringify(data, null, 2)}`);
      }
      break;

    case "summary":
      parts.push(
        `Get a health summary for patient "${user_handle}".`,
        `Use get_health_summary with patient_handle="${user_handle}".`,
      );
      break;

    case "triage":
      parts.push(
        `Perform triage for patient "${user_handle}".`,
        `Use triage_patient with the following data.`,
      );
      if (data) {
        parts.push(`\nTriage data:\n${JSON.stringify(data, null, 2)}`);
      }
      break;

    case "evidence":
      parts.push(
        `Look up clinical evidence for patient "${user_handle}".`,
        `Use lookup_clinical_evidence with the provided flags.`,
      );
      if (data) {
        parts.push(`\nEvidence query:\n${JSON.stringify(data, null, 2)}`);
      }
      break;

    case "general":
    default:
      parts.push(
        `Health analysis request for patient "${user_handle}".`,
        `Use the appropriate tools to answer this request.`,
      );
      break;
  }

  if (message) {
    parts.push(`\nUser message: ${message}`);
  }

  return parts.join("\n");
}

/* ------------------------------------------------------------------ */
/*  Anthropic (Claude) tool-calling loop                               */
/* ------------------------------------------------------------------ */

async function runAnthropicLoop(
  userMessage: string,
  tools: ToolDef[],
  toolCallLog: ToolCallLogEntry[],
  ctx: HealthAgentContext,
): Promise<{ finalDecision: string; turns: number }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { finalDecision: "Anthropic API key not configured.", turns: 0 };
  }

  const messages: Array<Record<string, unknown>> = [
    { role: "user", content: userMessage },
  ];

  const anthropicTools = tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    let data: Record<string, unknown>;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 1024,
          system: HEALTH_AGENT_SYSTEM_PROMPT,
          messages,
          tools: anthropicTools,
        }),
      });

      data = await res.json();
    } catch (e) {
      console.error("[HealthAgent] Anthropic fetch error on turn", turn, e);
      return {
        finalDecision:
          toolCallLog.length > 0
            ? buildFallbackSummary(toolCallLog)
            : `Health Agent network error: ${e instanceof Error ? e.message : String(e)}`,
        turns: turn + 1,
      };
    }

    if (data.error || data.type === "error") {
      const errMsg =
        (data.error as Record<string, unknown>)?.message ||
        JSON.stringify(data);
      console.error("[HealthAgent] Anthropic API error:", errMsg);
      return {
        finalDecision:
          toolCallLog.length > 0
            ? buildFallbackSummary(toolCallLog)
            : `Health Agent LLM error: ${errMsg}`,
        turns: turn + 1,
      };
    }

    const content = data.content as Array<Record<string, unknown>> | undefined;
    if (!content || content.length === 0) {
      return {
        finalDecision:
          toolCallLog.length > 0
            ? buildFallbackSummary(toolCallLog)
            : "Health Agent error: no response from LLM.",
        turns: turn + 1,
      };
    }

    // Parse response blocks
    const textBlocks: string[] = [];
    const toolUseBlocks: Array<{
      id: string;
      name: string;
      input: Record<string, unknown>;
    }> = [];

    for (const block of content) {
      if (block.type === "text") textBlocks.push(block.text as string);
      else if (block.type === "tool_use") {
        toolUseBlocks.push({
          id: block.id as string,
          name: block.name as string,
          input: block.input as Record<string, unknown>,
        });
      }
    }

    if (toolUseBlocks.length > 0) {
      messages.push({ role: "assistant", content });

      const toolResults: Array<Record<string, unknown>> = [];

      for (const toolUse of toolUseBlocks) {
        addStep(ctx.traceId, {
          actor: "health_agent",
          event: "TOOL_CALL",
          ok: true,
          data: { tool: toolUse.name, args: toolUse.input },
        });

        const tool = tools.find((t) => t.name === toolUse.name);
        const result = tool
          ? await tool.execute(toolUse.input)
          : { error: true, message: `Unknown tool: ${toolUse.name}` };

        addStep(ctx.traceId, {
          actor: toolUse.name,
          event: "TOOL_RESULT",
          ok: !result.error,
          data: result,
        });

        toolCallLog.push({
          tool: toolUse.name,
          args: toolUse.input,
          result,
        });

        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: JSON.stringify(result),
        });
      }

      messages.push({ role: "user", content: toolResults });
      continue;
    }

    // No tool calls — LLM is done
    return {
      finalDecision: textBlocks.join("\n") || "Health analysis complete.",
      turns: turn + 1,
    };
  }

  return {
    finalDecision:
      toolCallLog.length > 0
        ? buildFallbackSummary(toolCallLog)
        : "Health Agent reached max turns.",
    turns: MAX_TURNS,
  };
}

/* ------------------------------------------------------------------ */
/*  OpenAI tool-calling loop                                           */
/* ------------------------------------------------------------------ */

async function runOpenAILoop(
  userMessage: string,
  tools: ToolDef[],
  toolCallLog: ToolCallLogEntry[],
  ctx: HealthAgentContext,
): Promise<{ finalDecision: string; turns: number }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { finalDecision: "OpenAI API key not configured.", turns: 0 };
  }

  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: HEALTH_AGENT_SYSTEM_PROMPT },
    { role: "user", content: userMessage },
  ];

  const openaiTools = tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    let data: Record<string, unknown>;

    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages,
          tools: openaiTools,
          tool_choice: "auto",
          max_tokens: 1024,
        }),
      });

      data = await res.json();
    } catch (e) {
      console.error("[HealthAgent] OpenAI fetch error on turn", turn, e);
      return {
        finalDecision:
          toolCallLog.length > 0
            ? buildFallbackSummary(toolCallLog)
            : `Health Agent network error: ${e instanceof Error ? e.message : String(e)}`,
        turns: turn + 1,
      };
    }

    const choices = data.choices as Array<Record<string, unknown>> | undefined;
    const msg = choices?.[0]?.message as Record<string, unknown> | undefined;

    if (!msg) {
      const err =
        (data.error as Record<string, unknown>)?.message ||
        JSON.stringify(data);
      console.error("[HealthAgent] OpenAI no message:", err);
      return {
        finalDecision:
          toolCallLog.length > 0
            ? buildFallbackSummary(toolCallLog)
            : `OpenAI error: ${err}`,
        turns: turn + 1,
      };
    }

    const msgContent = msg.content;
    const textContent =
      typeof msgContent === "string"
        ? msgContent
        : (msgContent as Array<Record<string, unknown>>)?.[0]?.text ?? "";
    const toolCalls = (msg.tool_calls || []) as Array<
      Record<string, unknown>
    >;

    if (toolCalls.length === 0) {
      return {
        finalDecision:
          (textContent as string) || "Health analysis complete.",
        turns: turn + 1,
      };
    }

    // Append assistant message with tool calls
    messages.push({
      role: "assistant",
      content: textContent || null,
      tool_calls: toolCalls.map((tc) => {
        const fn = tc.function as Record<string, string>;
        return {
          id: tc.id,
          type: "function",
          function: {
            name: fn?.name || "",
            arguments: fn?.arguments || "{}",
          },
        };
      }),
    });

    // Execute each tool call
    for (const tc of toolCalls) {
      const fn = tc.function as Record<string, string>;
      const name = fn?.name || "";
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(fn?.arguments || "{}");
      } catch {
        args = {};
      }

      addStep(ctx.traceId, {
        actor: "health_agent",
        event: "TOOL_CALL",
        ok: true,
        data: { tool: name, args },
      });

      const tool = tools.find((t) => t.name === name);
      const result = tool
        ? await tool.execute(args)
        : { error: true, message: `Unknown tool: ${name}` };

      addStep(ctx.traceId, {
        actor: name,
        event: "TOOL_RESULT",
        ok: !result.error,
        data: result,
      });

      toolCallLog.push({ tool: name, args, result });

      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify(result),
      });
    }
  }

  return {
    finalDecision:
      toolCallLog.length > 0
        ? buildFallbackSummary(toolCallLog)
        : "Health Agent reached max turns.",
    turns: MAX_TURNS,
  };
}

/* ------------------------------------------------------------------ */
/*  Deterministic fallback (no API key available)                      */
/* ------------------------------------------------------------------ */

async function runDeterministicFallback(
  input: HealthAgentInput,
  tools: ToolDef[],
  toolCallLog: ToolCallLogEntry[],
  ctx: HealthAgentContext,
): Promise<{ finalDecision: string; turns: number }> {
  const { request_type, data } = input;

  // For anomaly requests, call analyze_anomaly directly
  if (request_type === "anomaly" && data) {
    const analyzeTool = tools.find((t) => t.name === "analyze_anomaly");
    if (analyzeTool) {
      const result = await analyzeTool.execute(data);
      toolCallLog.push({ tool: "analyze_anomaly", args: data, result });

      addStep(ctx.traceId, {
        actor: "health_agent",
        event: "DETERMINISTIC_ANALYZE",
        ok: !result.error,
        data: result,
      });

      return {
        finalDecision: `[Deterministic] ${result.error ? `Error: ${result.message}` : `Anomaly analysis: urgency=${result.urgency}, should_contact_clinic=${result.should_contact_clinic}. ${result.summary_explanation || ""}`}`,
        turns: 1,
      };
    }
  }

  // For summary requests, call get_health_summary directly
  if (request_type === "summary") {
    const summaryTool = tools.find((t) => t.name === "get_health_summary");
    if (summaryTool) {
      const result = await summaryTool.execute({
        patient_handle: input.user_handle,
      });
      toolCallLog.push({
        tool: "get_health_summary",
        args: { patient_handle: input.user_handle },
        result,
      });

      return {
        finalDecision: `[Deterministic] Health summary: ${JSON.stringify(result).slice(0, 500)}`,
        turns: 1,
      };
    }
  }

  // For evidence requests, call lookup_clinical_evidence directly
  if (request_type === "evidence" && data?.flags) {
    const evidenceTool = tools.find(
      (t) => t.name === "lookup_clinical_evidence",
    );
    if (evidenceTool) {
      const result = await evidenceTool.execute(data);
      toolCallLog.push({
        tool: "lookup_clinical_evidence",
        args: data,
        result,
      });

      return {
        finalDecision: `[Deterministic] Clinical evidence: ${(result.patient_summary as string) || JSON.stringify(result).slice(0, 500)}`,
        turns: 1,
      };
    }
  }

  return {
    finalDecision:
      "[Deterministic] No LLM API key available. Unable to process health request.",
    turns: 0,
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function buildFallbackSummary(toolCallLog: ToolCallLogEntry[]): string {
  const parts: string[] = ["[Health Agent fallback summary]\n"];

  for (const tc of toolCallLog) {
    parts.push(`Tool: ${tc.tool}`);
    const r = tc.result;
    if (tc.tool === "analyze_anomaly" && !r.error) {
      parts.push(`  Urgency: ${r.urgency || "unknown"}`);
      parts.push(
        `  Should contact clinic: ${r.should_contact_clinic ?? "unknown"}`,
      );
      if (r.summary_explanation) {
        parts.push(
          `  Summary: ${(r.summary_explanation as string).slice(0, 200)}`,
        );
      }
    } else if (tc.tool === "get_health_summary" && !r.error) {
      parts.push(`  ${r.rangeDays || 0}-day summary retrieved`);
    } else if (tc.tool === "triage_patient" && !r.error) {
      parts.push(`  Urgency: ${r.urgency || "unknown"}`);
      parts.push(`  Escalation: ${r.escalation_triggered ?? false}`);
    } else if (tc.tool === "lookup_clinical_evidence" && !r.error) {
      const studyCount = (r.studies as unknown[])?.length ?? 0;
      const guidelineCount = (r.guidelines as unknown[])?.length ?? 0;
      parts.push(`  Found ${studyCount} studies, ${guidelineCount} guidelines`);
    } else if (tc.tool === "get_health_metrics" && !r.error) {
      parts.push(`  Retrieved ${r.count || 0} metric records`);
    } else if (tc.tool === "get_anomaly_history" && !r.error) {
      parts.push(`  Found ${r.count || 0} past alerts`);
    } else if (r.error) {
      parts.push(`  Error: ${r.message || JSON.stringify(r)}`);
    } else {
      parts.push(`  Result: ${JSON.stringify(r).slice(0, 200)}`);
    }
    parts.push("");
  }

  return parts.join("\n");
}
