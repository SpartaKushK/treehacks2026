import { SOAP_NOTE_PROMPT } from "./prompts";
import type { ClinicalEntities, ConversationMessage, SOAPNote } from "./types";

export async function generateSOAPNote(
  messages: ConversationMessage[],
  entities: ClinicalEntities,
  healthData?: Record<string, unknown>,
  callDuration?: number,
): Promise<SOAPNote | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const transcript = messages
    .map((m) => `${m.role === "doctor" ? "Dr. Smith" : "Patient"}: ${m.text}`)
    .join("\n");

  const userPrompt = `TRANSCRIPT:\n${transcript}\n\nEXTRACTED ENTITIES:\n${JSON.stringify(entities, null, 2)}\n\nPATIENT WEARABLE DATA:\n${JSON.stringify(healthData || {}, null, 2)}\n\nCALL DURATION: ${callDuration ? Math.round(callDuration / 1000) : 0} seconds`;

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
        max_tokens: 2048,
        system: SOAP_NOTE_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    const data = await res.json();
    if (data.error || !data.content?.[0]?.text) return null;

    const text = data.content[0].text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const soapData = JSON.parse(jsonMatch[0]);

    const soapNote: SOAPNote = {
      ...soapData,
      metadata: {
        generatedAt: new Date().toISOString(),
        conversationDuration: callDuration || 0,
        totalUtterances: messages.length,
        redFlagsDetected: entities.redFlags.length,
        automatedActionsTriggered: [],
      },
    };

    return soapNote;
  } catch (err) {
    console.error("SOAP note generation failed:", err);
    return null;
  }
}
