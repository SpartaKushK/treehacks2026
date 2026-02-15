import { NextRequest, NextResponse } from "next/server";
import { DoctorAlertSchema } from "@/lib/agentRegistry";

export const runtime = "nodejs";

/**
 * Proxy (and optional mock) for the Doctor Agent /alert endpoint.
 *
 * It forwards validated HealthAlert payloads to the Python doctor agent
 * at DOCTOR_AGENT_URL. If the doctor service is unreachable, it can return
 * a deterministic mock response (enabled by default; set DOCTOR_AGENT_FALLBACK=false to disable).
 */
export async function POST(req: NextRequest) {
  const doctorUrlEnv =
    process.env.DOCTOR_AGENT_URL?.replace(/\/$/, "") || "http://localhost:8000";
  // If someone accidentally points at the Next app (3000), fall back to 8000
  const doctorUrl =
    doctorUrlEnv.includes("3000") && !doctorUrlEnv.includes("8000")
      ? "http://127.0.0.1:8000"
      : doctorUrlEnv;
  const allowFallback = process.env.DOCTOR_AGENT_FALLBACK !== "false";

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = DoctorAlertSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: `Invalid payload: ${parsed.error.message}` },
      { status: 400 },
    );
  }

  // Forward to doctor agent
  try {
    console.log("[doctor proxy] forwarding to", `${doctorUrl}/alert`);
    const res = await fetch(`${doctorUrl}/alert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data),
      // 20s timeout
      signal: AbortSignal.timeout(20_000),
    });

    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }

    return NextResponse.json(
      { forwarded: true, status: res.status, body },
      { status: res.ok ? 200 : res.status },
    );
  } catch (err) {
    console.warn("[doctor proxy] forward failed", err);
    if (!allowFallback) {
      return NextResponse.json(
        { error: `Doctor agent unreachable: ${String(err)}` },
        { status: 502 },
      );
    }

    // Deterministic mock success
    const mockSessionId = "mock-" + Math.random().toString(36).slice(2, 10);
    return NextResponse.json({
      forwarded: false,
      mock: true,
      session_id: mockSessionId,
      status: "processing",
      triage_severity: "medium",
      message:
        "Doctor agent not reachable; returning mock acknowledgment. Start the Python doctor service and set DOCTOR_AGENT_FALLBACK=false to enforce live calls.",
    });
  }
}
