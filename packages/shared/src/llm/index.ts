import { OpenAIPlanner } from "./openai";
import { ClaudePlanner } from "./anthropic";

export type Provider = "openai" | "claude";

export function createPlanner(provider: Provider) {
  return provider === "openai" ? new OpenAIPlanner() : new ClaudePlanner();
}

export { OpenAIPlanner, ClaudePlanner };
