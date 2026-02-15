/**
 * Health Observer — silently extracts health-related information from chat exchanges.
 *
 * Runs as a fire-and-forget call after each chat response stream closes.
 * Uses a separate (non-streaming) Anthropic call so extraction context
 * stays isolated from the responder session.
 */

import { prisma } from "./store";

const HEALTH_OBSERVER_SYSTEM_PROMPT = `You are a health information extraction agent. Your job is to analyze a conversation exchange between a user and an AI assistant and extract ANY health-related mentions.

Categories you should look for:
- sleep: sleep duration, quality, insomnia, naps
- symptoms: headaches, pain, nausea, fatigue, dizziness, etc.
- medication: any mention of taking, starting, stopping, or missing medications
- vitals: blood pressure, heart rate, temperature, weight, blood sugar
- mood: anxiety, depression, stress, happiness, emotional state
- diet: meals, nutrition, appetite, hydration, alcohol, caffeine
- exercise: physical activity, workouts, steps, sedentary behavior
- doctor_visit: appointments, diagnoses, test results, referrals
- other: any other health-relevant information

For each health mention found, extract:
- category: one of the categories above
- rawContent: the exact text from the conversation containing the health mention
- summary: a concise one-sentence summary
- structuredData: a JSON object with numeric/structured values when applicable (e.g. {"hours": 3} for sleep, {"systolic": 140, "diastolic": 90} for blood pressure). Use {} if no structured data applies.
- mentionedDate: ISO date string (YYYY-MM-DD) if the user mentions when the health event occurred. Resolve relative dates like "yesterday", "last Tuesday", "this morning" using the provided current date. null if no date is mentioned or implied.
- confidence: 0.0 to 1.0 indicating how confident you are this is a genuine health mention (not metaphorical or hypothetical)

IMPORTANT:
- Only extract when genuinely health-relevant (confidence > 0.5)
- Do NOT extract hypothetical or metaphorical health mentions (e.g. "that gives me a headache" meaning frustration)
- Return valid JSON only, no markdown formatting

Response format:
{"extractions": [...]}

If there is nothing health-related in the exchange, return:
{"extractions": []}`;

interface ObserveInput {
  userMessage: string;
  assistantResponse: string;
  humanId: string;
  conversationId: string;
  currentDate: string;
}

interface Extraction {
  category: string;
  rawContent: string;
  summary: string;
  structuredData: Record<string, unknown>;
  mentionedDate: string | null;
  confidence: number;
}

const VALID_CATEGORIES = new Set([
  "sleep",
  "symptoms",
  "medication",
  "vitals",
  "mood",
  "diet",
  "exercise",
  "doctor_visit",
  "other",
]);

function isValidExtraction(e: unknown): e is Extraction {
  if (!e || typeof e !== "object") return false;
  const obj = e as Record<string, unknown>;
  return (
    typeof obj.category === "string" &&
    VALID_CATEGORIES.has(obj.category) &&
    typeof obj.rawContent === "string" &&
    typeof obj.summary === "string" &&
    typeof obj.confidence === "number" &&
    obj.confidence > 0.5
  );
}

export async function observeHealthMentions(input: ObserveInput): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return;

  const userPrompt = `Current date: ${input.currentDate}

USER MESSAGE:
${input.userMessage}

ASSISTANT RESPONSE:
${input.assistantResponse}`;

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
      system: HEALTH_OBSERVER_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  const data = await res.json();
  if (data.error || !data.content?.[0]?.text) {
    console.warn("[health-observer] API returned no content:", data.error);
    return;
  }

  const text = data.content[0].text;

  // Extract JSON from the response (handle markdown code blocks)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.warn("[health-observer] no JSON found in response");
    return;
  }

  const parsed = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(parsed.extractions)) {
    console.warn("[health-observer] unexpected response shape");
    return;
  }

  const valid = parsed.extractions.filter(isValidExtraction);
  if (valid.length === 0) return;

  await prisma.healthExtraction.createMany({
    data: valid.map((e: Extraction) => ({
      humanId: input.humanId,
      conversationId: input.conversationId,
      category: e.category,
      rawContent: e.rawContent,
      summary: e.summary,
      structuredData:
        typeof e.structuredData === "object" && e.structuredData !== null
          ? JSON.stringify(e.structuredData)
          : "{}",
      mentionedDate: e.mentionedDate ?? null,
      confidence: e.confidence,
    })),
  });

  console.log(
    `[health-observer] extracted ${valid.length} health mention(s) for human ${input.humanId}`,
  );
}
