/**
 * Shared utilities for agents
 */

/**
 * Sleep for a given number of milliseconds.
 * Useful for rate limiting between LLM calls.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Extract a user handle from input data.
 * Tries multiple common field names.
 */
export function extractUserHandle(
  input: Record<string, unknown>,
): string {
  const handle =
    (input.user_handle as string) ||
    (input.userHandle as string) ||
    (input.patient_handle as string) ||
    (input.patientHandle as string) ||
    "unknown";
  return handle;
}

/**
 * Build a fallback summary from tool call results when LLM is unavailable.
 */
export function buildToolCallSummary(
  toolCalls: Array<{
    tool: string;
    args: Record<string, unknown>;
    result: Record<string, unknown>;
  }>,
): string {
  const parts: string[] = [
    "[Agent fallback — LLM unavailable for final summary]\n",
  ];

  for (const tc of toolCalls) {
    parts.push(`Tool: ${tc.tool}`);
    const r = tc.result;

    if (r.error) {
      parts.push(`  Error: ${r.message || JSON.stringify(r)}`);
    } else {
      // Generic result display
      const preview = JSON.stringify(r).slice(0, 200);
      parts.push(`  Result: ${preview}`);
    }
    parts.push("");
  }

  return parts.join("\n");
}
