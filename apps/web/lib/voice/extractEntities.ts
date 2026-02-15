import { CLINICAL_EXTRACTION_PROMPT } from "./prompts";
import type { ClinicalEntities, ConversationMessage } from "./types";

export async function extractEntities(
  latestUtterance: string,
  conversationHistory: ConversationMessage[],
  existingEntities: ClinicalEntities,
): Promise<{ entities: ClinicalEntities; newRedFlags: ClinicalEntities["redFlags"] }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { entities: existingEntities, newRedFlags: [] };
  }

  const historyText = conversationHistory
    .map((m) => `${m.role === "doctor" ? "Dr. Smith" : "Patient"}: ${m.text}`)
    .join("\n");

  const userPrompt = `CONVERSATION SO FAR:\n${historyText}\n\nLATEST PATIENT UTTERANCE:\n"${latestUtterance}"\n\nPREVIOUSLY EXTRACTED ENTITIES:\n${JSON.stringify(existingEntities, null, 2)}`;

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
        system: CLINICAL_EXTRACTION_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    const data = await res.json();
    if (data.error || !data.content?.[0]?.text) {
      return { entities: existingEntities, newRedFlags: [] };
    }

    const text = data.content[0].text;
    // Extract JSON from the response (handle markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { entities: existingEntities, newRedFlags: [] };
    }

    const extracted = JSON.parse(jsonMatch[0]);

    // Merge new entities with existing
    const merged: ClinicalEntities = {
      symptoms: [
        ...existingEntities.symptoms,
        ...(extracted.new_symptoms || []),
      ],
      medications: [
        ...existingEntities.medications,
        ...(extracted.new_medications || []),
      ],
      allergies: [
        ...new Set([
          ...existingEntities.allergies,
          ...(extracted.new_allergies || []),
        ]),
      ],
      conditions: [
        ...new Set([
          ...existingEntities.conditions,
          ...(extracted.new_conditions || []),
        ]),
      ],
      redFlags: [
        ...existingEntities.redFlags,
        ...(extracted.red_flags || []),
      ],
      vitalSigns: existingEntities.vitalSigns,
    };

    return {
      entities: merged,
      newRedFlags: extracted.red_flags || [],
    };
  } catch (err) {
    console.error("Entity extraction failed:", err);
    return { entities: existingEntities, newRedFlags: [] };
  }
}
