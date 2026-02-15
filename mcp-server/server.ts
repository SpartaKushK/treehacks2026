import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "http";
import { z } from "zod";

const NEXTJS_URL = process.env.NEXTJS_URL || "http://localhost:3000";

// ── Tool definitions ────────────────────────────────────────────

function registerTools(server: McpServer) {
  // 1. Health Summary
  server.tool(
    "get_health_summary",
    "Retrieve a 30-day health summary for a patient. Includes sleep, activity, medication adherence, symptom trends, and an AI-generated patient-friendly explanation.",
    {
      patient_handle: z.string().default("pari").describe("The patient's handle (e.g. 'pari')"),
      provider: z.enum(["openai", "claude"]).default("claude").describe("LLM provider for generating the summary"),
    },
    async ({ patient_handle, provider }) => {
      try {
        const url = `${NEXTJS_URL}/api/demo/health?patient=${encodeURIComponent(patient_handle)}&provider=${provider}`;
        const res = await fetch(url);
        const data = await res.json();

        if (data.error) {
          return { content: [{ type: "text", text: `Error: ${data.error}` }], isError: true };
        }

        const s = data.healthSummary;
        const lines = [
          `Health Summary for ${patient_handle}`,
          `Period: ${s.rangeDays} days`,
          ``,
          `Sleep: avg ${s.sleep.avg}h/night (trend: ${s.sleep.trend})`,
          `Activity: avg ${s.activity.avgSteps} steps/day (trend: ${s.activity.trend})`,
          `Medication Adherence: ${s.medication.adherencePct}% (${s.medication.missedDays} missed days)`,
          `Symptoms: avg score ${s.symptoms.avgScore}/10`,
        ];
        if (s.notes?.length > 0) {
          lines.push(``, `Notes:`, ...s.notes.map((n: string) => `  - ${n}`));
        }
        if (s.patientFriendlyText) {
          lines.push(``, `AI Summary: ${s.patientFriendlyText}`);
        }
        lines.push(``, `Trace ID: ${data.traceId}`);

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: `CareSync app not reachable at ${NEXTJS_URL}. Make sure the Next.js app is running.` }],
          isError: true,
        };
      }
    }
  );

  // 2. Analyze Anomaly
  server.tool(
    "analyze_anomaly",
    "Run the full anomaly detection pipeline on sample wearable data. Analyzes severity, triages the patient, and may schedule an appointment automatically. Choose 'severe' for a high anomaly score (92/100) or 'moderate' for a medium score (55/100).",
    {
      severity: z.enum(["severe", "moderate"]).default("severe").describe("Anomaly severity level for the demo"),
      provider: z.enum(["openai", "claude"]).default("claude").describe("LLM provider for analysis"),
    },
    async ({ severity, provider }) => {
      try {
        const url = `${NEXTJS_URL}/api/demo/anomaly?severity=${severity}&provider=${provider}`;
        const res = await fetch(url);
        const data = await res.json();

        if (data.error) {
          return { content: [{ type: "text", text: `Error: ${data.error}. Detail: ${data.detail || ""}` }], isError: true };
        }

        const lines = [
          `Anomaly Analysis (${severity})`,
          `Provider: ${data.provider}`,
          ``,
          `Decision:`,
          JSON.stringify(data.decision, null, 2),
        ];
        if (data.triage_outcome) {
          lines.push(``, `Triage Outcome:`, JSON.stringify(data.triage_outcome, null, 2));
        }
        lines.push(``, `Trace ID: ${data.traceId}`);

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: `CareSync app not reachable at ${NEXTJS_URL}. Make sure the Next.js app is running.` }],
          isError: true,
        };
      }
    }
  );

  // 3. Run Health Trigger (Secretary Agent)
  server.tool(
    "run_health_trigger",
    "Send health trigger data through the Secretary Agent. The agent uses AI function-calling to automatically analyze anomalies, triage patients, retrieve health summaries, and schedule appointments as needed. This is the most powerful tool — it runs the full intelligent pipeline.",
    {
      trigger_type: z.enum(["health_anomaly", "health_summary", "schedule", "custom"]).default("health_anomaly").describe("Type of health trigger"),
      provider: z.enum(["openai", "claude"]).default("claude").describe("LLM provider"),
      description: z.string().optional().describe("Human-readable description of the trigger"),
      user_handle: z.string().default("pari").describe("The patient handle"),
      anomaly_score: z.number().default(85).describe("Anomaly score 0-100 (higher = more anomalous)"),
      sleep_hours: z.number().default(4.5).describe("Patient's sleep hours"),
      resting_hr_bpm: z.number().default(82).describe("Resting heart rate in BPM"),
      steps: z.number().default(2500).describe("Daily step count"),
      flags: z.string().default("SLEEP_DROP,RHR_SPIKE,STEPS_DROP").describe("Comma-separated anomaly flags"),
    },
    async ({ trigger_type, provider, description, user_handle, anomaly_score, sleep_hours, resting_hr_bpm, steps, flags }) => {
      try {
        const triggerData = {
          user_handle,
          date: new Date().toISOString().split("T")[0],
          baseline_window_days: 28,
          metrics: { sleep_hours, resting_hr_bpm, steps },
          baseline: { sleep_mean: 7.1, sleep_std: 0.6, rhr_mean: 62, rhr_std: 3, steps_mean: 7500, steps_std: 1200 },
          flags: flags.split(",").map((f) => f.trim()),
          anomaly_score,
        };

        const res = await fetch(`${NEXTJS_URL}/api/trigger`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            trigger_type,
            provider,
            data: triggerData,
            description: description || `Health anomaly trigger for ${user_handle}`,
          }),
        });
        const data = await res.json();

        if (data.error) {
          return { content: [{ type: "text", text: `Error: ${data.error}` }], isError: true };
        }

        const lines = [
          `Secretary Agent Result`,
          `Provider: ${data.provider} | Turns: ${data.turns}`,
          ``,
          `Final Decision:`,
          data.finalDecision,
          ``,
          `Tool Calls Made: ${data.toolCallLog?.length || 0}`,
        ];
        if (data.toolCallLog?.length > 0) {
          for (const tc of data.toolCallLog) {
            lines.push(`  - ${tc.tool}: ${tc.result.error ? "ERROR" : "OK"}`);
          }
        }
        lines.push(``, `Trace ID: ${data.traceId}`);

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: `CareSync app not reachable at ${NEXTJS_URL}. Make sure the Next.js app is running.` }],
          isError: true,
        };
      }
    }
  );

  // 4. Schedule Appointment
  server.tool(
    "schedule_appointment",
    "Schedule a meeting between two people. Uses multi-agent negotiation with Google Calendar integration to find available slots and book the appointment.",
    {
      from_handle: z.string().default("pari").describe("Handle of the person requesting the meeting"),
      to_handle: z.string().default("alex").describe("Handle of the person being invited"),
      provider: z.enum(["openai", "claude"]).default("claude").describe("LLM provider for negotiation"),
    },
    async ({ from_handle, to_handle, provider }) => {
      try {
        const url = `${NEXTJS_URL}/api/demo/schedule?from=${encodeURIComponent(from_handle)}&to=${encodeURIComponent(to_handle)}&provider=${provider}`;
        const res = await fetch(url, { method: "POST" });
        const data = await res.json();

        if (data.error) {
          return { content: [{ type: "text", text: `Error: ${data.error}. Detail: ${data.detail || ""}` }], isError: true };
        }

        const lines = [
          `Appointment Scheduled`,
          `Provider: ${data.provider}`,
          `Booking ID: ${data.bookingId}`,
          ``,
          `Time Slot:`,
          `  Start: ${data.chosenSlot?.start}`,
          `  End: ${data.chosenSlot?.end}`,
          ``,
          `Negotiation Messages:`,
          ...(data.messages || []).map((m: string, i: number) => `  Turn ${i}: ${m}`),
          ``,
          `Trace ID: ${data.traceId}`,
        ];

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: `CareSync app not reachable at ${NEXTJS_URL}. Make sure the Next.js app is running.` }],
          isError: true,
        };
      }
    }
  );

  // 5. Get Trace
  server.tool(
    "get_trace",
    "Retrieve the full execution trace for a previous operation. Shows every step of the agent pipeline including tool calls, policy checks, and AI decisions. Use the trace_id returned from other tools.",
    {
      trace_id: z.string().describe("The trace ID returned from a previous tool call"),
    },
    async ({ trace_id }) => {
      try {
        const url = `${NEXTJS_URL}/api/demo/trace/${encodeURIComponent(trace_id)}`;
        const res = await fetch(url);
        const data = await res.json();

        if (data.error) {
          return { content: [{ type: "text", text: `Error: ${data.error}` }], isError: true };
        }

        const lines = [`Execution Trace: ${trace_id}`, ``];
        const steps = data.steps || data.stepsJson || [];
        for (const step of steps) {
          lines.push(`[${step.actor}] ${step.event} — ${step.ok ? "OK" : "FAIL"}`);
          if (step.data) {
            lines.push(`  ${JSON.stringify(step.data).slice(0, 200)}`);
          }
        }
        if (steps.length === 0) {
          lines.push(JSON.stringify(data, null, 2));
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: `CareSync app not reachable at ${NEXTJS_URL}. Make sure the Next.js app is running.` }],
          isError: true,
        };
      }
    }
  );
}

// ── Start the server ────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || "8787");

const httpServer = createServer(async (req, res) => {
  if (req.url === "/mcp" || req.url?.startsWith("/mcp?")) {
    const server = new McpServer(
      {
        name: "caresync-health",
        version: "1.0.0",
      },
      { capabilities: { tools: {} } }
    );
    registerTools(server);

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    await transport.handleRequest(req, res);
  } else {
    res.writeHead(404);
    res.end("Not found — MCP endpoint is at /mcp");
  }
});

httpServer.listen(PORT, () => {
  console.log(`\nCareSync MCP server running at http://localhost:${PORT}/mcp`);
  console.log(`Proxying to Next.js at ${NEXTJS_URL}`);
  console.log(`\nTools available:`);
  console.log(`  - get_health_summary    30-day patient health overview`);
  console.log(`  - analyze_anomaly       Run anomaly detection pipeline`);
  console.log(`  - run_health_trigger    Full Secretary Agent pipeline`);
  console.log(`  - schedule_appointment  Multi-agent calendar scheduling`);
  console.log(`  - get_trace             View execution traces`);
  console.log(`\nNext step — in another terminal, run:\n`);
  console.log(`  npx poke tunnel http://localhost:${PORT}/mcp --name "CareSync"\n`);
});
