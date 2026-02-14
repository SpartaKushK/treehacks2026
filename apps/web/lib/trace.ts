import { v4 as uuid } from "uuid";
import { prisma } from "./store";
import type { TraceStep } from "@people/shared";

/* ── In-memory buffer for active traces ── */
const liveTraces = new Map<
  string,
  {
    provider: string;
    steps: TraceStep[];
    title: string;
    childCalls?: { handle: string; capability: string; childTraceId: string }[];
  }
>();

export function startTrace(opts: {
  provider: string;
  title: string;
}): string {
  const id = uuid();
  liveTraces.set(id, { provider: opts.provider, steps: [], title: opts.title });
  return id;
}

export function addStep(traceId: string, step: Omit<TraceStep, "t">): void {
  const trace = liveTraces.get(traceId);
  if (!trace) return;
  trace.steps.push({ t: new Date().toISOString(), ...step });
}

export function addChildCall(
  traceId: string,
  child: { handle: string; capability: string; childTraceId: string }
): void {
  const trace = liveTraces.get(traceId);
  if (!trace) return;
  if (!trace.childCalls) trace.childCalls = [];
  trace.childCalls.push(child);
}

export async function finalizeTrace(traceId: string) {
  const trace = liveTraces.get(traceId);
  if (!trace) return null;

  // Persist steps and child_calls so getTrace from DB returns full graph
  const payload: { steps: TraceStep[]; child_calls?: { handle: string; capability: string; childTraceId: string }[] } = {
    steps: trace.steps,
  };
  if (trace.childCalls && trace.childCalls.length > 0) {
    payload.child_calls = trace.childCalls;
  }

  const record = await prisma.trace.create({
    data: {
      id: traceId,
      provider: trace.provider,
      stepsJson: JSON.stringify(payload),
    },
  });

  liveTraces.delete(traceId);
  return record;
}

export async function getTrace(traceId: string) {
  // Check live first
  const live = liveTraces.get(traceId);
  if (live) {
    return {
      id: traceId,
      createdAt: new Date().toISOString(),
      provider: live.provider,
      steps: live.steps,
      child_calls: live.childCalls || [],
    };
  }
  // Then DB (stepsJson may be legacy array or { steps, child_calls })
  const record = await prisma.trace.findUnique({ where: { id: traceId } });
  if (!record) return null;
  const parsed = JSON.parse(record.stepsJson) as
    | TraceStep[]
    | { steps: TraceStep[]; child_calls?: { handle: string; capability: string; childTraceId: string }[] };
  const steps = Array.isArray(parsed) ? parsed : parsed.steps;
  const child_calls = Array.isArray(parsed) ? [] : (parsed.child_calls ?? []);
  return {
    id: record.id,
    createdAt: record.createdAt.toISOString(),
    provider: record.provider,
    steps,
    child_calls,
  };
}
