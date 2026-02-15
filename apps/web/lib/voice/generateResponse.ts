import { DOCTOR_CONVERSATION_PROMPT } from "./prompts";
import type { ClinicalEntities, ConversationMessage } from "./types";

export async function generateDoctorResponse(
  messages: ConversationMessage[],
  extractedEntities: ClinicalEntities,
  healthContext?: Record<string, unknown>,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return "I'm sorry, I'm having trouble connecting right now. Please try again in a moment.";
  }

  let systemPrompt = DOCTOR_CONVERSATION_PROMPT;
  if (healthContext) {
    systemPrompt += `\n\nHEALTH_CONTEXT (from patient's wearable data):\n${JSON.stringify(healthContext, null, 2)}`;
  }
  if (extractedEntities.redFlags.length > 0) {
    systemPrompt += `\n\nACTIVE RED FLAGS:\n${extractedEntities.redFlags.map((f) => `- [${f.severity.toUpperCase()}] ${f.flag}: ${f.action}`).join("\n")}`;
  }

  const conversationMessages = messages.map((m) => ({
    role: m.role === "doctor" ? "assistant" : "user",
    content: m.text,
  }));

  // If conversation is empty, the doctor should initiate
  if (conversationMessages.length === 0) {
    conversationMessages.push({
      role: "user",
      content: "[Patient has joined the video call. Greet them and begin the consultation.]",
    });
  }

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
        max_tokens: 256,
        system: systemPrompt,
        messages: conversationMessages,
      }),
    });

    const data = await res.json();
    if (data.error || !data.content?.[0]?.text) {
      return "I apologize, could you repeat that? I want to make sure I understand correctly.";
    }

    return data.content[0].text;
  } catch (err) {
    console.error("Doctor response generation failed:", err);
    return "I'm sorry, I missed that. Could you say that again?";
  }
}
