import { NextRequest, NextResponse } from "next/server";
import { generateSOAPNote } from "@/lib/voice/generateSOAPNote";
import type { ClinicalEntities, ConversationMessage } from "@/lib/voice/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      messages,
      entities,
      healthData,
      callDuration,
    } = body as {
      messages: ConversationMessage[];
      entities: ClinicalEntities;
      healthData?: Record<string, unknown>;
      callDuration: number;
    };

    const soapNote = await generateSOAPNote(
      messages,
      entities,
      healthData,
      callDuration,
    );

    if (!soapNote) {
      return NextResponse.json(
        { error: "Failed to generate SOAP note" },
        { status: 500 },
      );
    }

    // Determine automated actions based on entities
    const actions: string[] = [];
    if (entities.redFlags.some((f) => f.severity === "critical")) {
      actions.push("triage_urgent");
      soapNote.metadata.automatedActionsTriggered.push("Urgent triage triggered");
    }
    if (entities.redFlags.length > 0) {
      actions.push("family_notified");
      soapNote.metadata.automatedActionsTriggered.push("Family notification sent");
    }
    if (entities.medications.some((m) => m.compliance === "stopped" || m.compliance === "missed")) {
      actions.push("medication_followup");
      soapNote.metadata.automatedActionsTriggered.push("Medication follow-up scheduled");
    }

    // Trigger the secretary agent pipeline for automated actions if there are red flags
    if (entities.redFlags.length > 0) {
      try {
        const baseUrl = req.nextUrl.origin;
        await fetch(`${baseUrl}/api/trigger`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "health_anomaly",
            data: {
              source: "voice_consultation",
              anomaly_score: entities.redFlags.some((f) => f.severity === "critical") ? 85 : 60,
              flags: entities.redFlags.map((f) => f.flag),
              symptoms: entities.symptoms.map((s) => s.name),
              medications: entities.medications.map((m) => `${m.name} (${m.compliance})`),
              soap_summary: soapNote.assessment.primaryDiagnosis,
            },
            provider: "claude",
          }),
        }).catch(() => {
          // Non-blocking — don't fail SOAP note generation if trigger fails
        });
      } catch {
        // Ignore trigger errors
      }
    }

    return NextResponse.json({
      soapNote,
      actions,
    });
  } catch (err) {
    console.error("Voice summary error:", err);
    return NextResponse.json(
      { error: "Failed to generate summary" },
      { status: 500 },
    );
  }
}
