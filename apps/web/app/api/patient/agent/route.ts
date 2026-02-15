import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Patient Agent Stub
 *
 * Receives SlotProposal payloads from the Doctor Agent and immediately
 * accepts the first proposed slot by calling back to the doctor agent's
 * /schedule/response endpoint.
 */
export async function POST(req: NextRequest) {
  try {
    const proposal = await req.json();
    const doctorBase = process.env.DOCTOR_AGENT_URL || "http://localhost:8000";

    const proposalId = proposal.proposal_id || proposal.proposalId || "proposal";
    const patientId = proposal.patient_id || proposal.patientId || "patient";
    const firstSlot =
      Array.isArray(proposal.proposed_slots) && proposal.proposed_slots.length > 0
        ? proposal.proposed_slots[0]
        : null;

    const slotResponse = {
      proposal_id: proposalId,
      patient_id: patientId,
      accepted: !!firstSlot,
      selected_slot: firstSlot
        ? {
            start: firstSlot.start,
            end: firstSlot.end,
            label: firstSlot.label || "auto-selected",
          }
        : null,
      counter_message: firstSlot ? null : "No slots provided.",
    };

    // Fire-and-forget callback to doctor agent
    try {
      await fetch(`${doctorBase}/schedule/response`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(slotResponse),
      });
    } catch (err) {
      // If callback fails, still return 200 to avoid blocking the pipeline
      return NextResponse.json(
        { ok: false, message: "Failed to reply to doctor agent", error: String(err) },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true, proposal_id: proposalId });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid payload" },
      { status: 400 },
    );
  }
}

