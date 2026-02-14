import { v4 as uuid } from "uuid";
import { prisma } from "./store";
import type { TraceStep } from "@people/shared";

/* ── In-memory buffer for active traces ── */
const liveTraces = new Map<
  string,
  { provider: string; steps: TraceStep[]; title: string }
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

export async function finalizeTrace(traceId: string) {
  const trace = liveTraces.get(traceId);
  if (!trace) return null;

  const record = await prisma.trace.create({
    data: {
      id: traceId,
      provider: trace.provider,
      stepsJson: JSON.stringify(trace.steps),
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
    };
  }
  // Then DB
  const record = await prisma.trace.findUnique({ where: { id: traceId } });
  if (!record) return null;
  return {
    id: record.id,
    createdAt: record.createdAt.toISOString(),
    provider: record.provider,
    steps: JSON.parse(record.stepsJson) as TraceStep[],
  };
}
