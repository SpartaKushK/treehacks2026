import { NextRequest, NextResponse } from "next/server";
import { generateDoctorResponse } from "@/lib/voice/generateResponse";
import { extractEntities } from "@/lib/voice/extractEntities";
import type { ClinicalEntities, ConversationMessage } from "@/lib/voice/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      messages,
      extractedEntities,
      healthContext,
      language = "en",
    } = body as {
      messages: ConversationMessage[];
      extractedEntities: ClinicalEntities;
      healthContext?: Record<string, unknown>;
      language?: string;
    };

    // Get the latest patient message for entity extraction
    const latestPatientMsg = [...messages]
      .reverse()
      .find((m) => m.role === "patient");

    // Run response generation and entity extraction in parallel
    const [responseText, extractionResult] = await Promise.all([
      generateDoctorResponse(messages, extractedEntities, healthContext, language),
      latestPatientMsg
        ? extractEntities(latestPatientMsg.text, messages, extractedEntities)
        : Promise.resolve({ entities: extractedEntities, newRedFlags: [] }),
    ]);

    return NextResponse.json({
      responseText,
      updatedEntities: extractionResult.entities,
      newRedFlags: extractionResult.newRedFlags,
    });
  } catch (err) {
    console.error("Voice respond error:", err);
    return NextResponse.json(
      { error: "Failed to process voice input" },
      { status: 500 },
    );
  }
}
