/**
 * Trace Hooks — Maps Claude Agent SDK hook events to the existing trace system.
 *
 * PreToolUse:  logs TOOL_CALL steps before tool execution
 * PostToolUse: logs TOOL_RESULT steps after tool execution
 */

import type {
  HookCallback,
  PreToolUseHookInput,
  PostToolUseHookInput,
  SyncHookJSONOutput,
} from "@anthropic-ai/claude-agent-sdk";
import { addStep } from "../trace";
import { getActiveContext } from "./healthcareMcpServer";

/** Strip the MCP prefix for cleaner trace display */
function cleanToolName(name: string): string {
  return name.replace(/^mcp__healthcare__/, "");
}

/* ------------------------------------------------------------------ */
/*  PreToolUse Hook                                                    */
/* ------------------------------------------------------------------ */

export const preToolUseHook: HookCallback = async (
  input,
  _toolUseID,
  _options
): Promise<SyncHookJSONOutput> => {
  const ctx = getActiveContext();
  if (!ctx) return {};

  const preInput = input as PreToolUseHookInput;
  const toolName = cleanToolName(preInput.tool_name);

  addStep(ctx.traceId, {
    actor: "secretary",
    event: "TOOL_CALL",
    ok: true,
    provider: ctx.provider,
    data: { tool: toolName, args: preInput.tool_input },
  });

  return {};
};

/* ------------------------------------------------------------------ */
/*  PostToolUse Hook                                                   */
/* ------------------------------------------------------------------ */

export const postToolUseHook: HookCallback = async (
  input,
  _toolUseID,
  _options
): Promise<SyncHookJSONOutput> => {
  const ctx = getActiveContext();
  if (!ctx) return {};

  const postInput = input as PostToolUseHookInput;
  const toolName = cleanToolName(postInput.tool_name);

  // Parse the tool response to check for errors
  let resultData: Record<string, unknown> = {};
  let isError = false;
  try {
    const rawResponse = postInput.tool_response;
    if (typeof rawResponse === "string") {
      resultData = JSON.parse(rawResponse);
    } else if (rawResponse && typeof rawResponse === "object") {
      resultData = rawResponse as Record<string, unknown>;
    }
    isError = !!resultData.error;
  } catch {
    resultData = { raw: String(postInput.tool_response).slice(0, 500) };
  }

  addStep(ctx.traceId, {
    actor: toolName,
    event: "TOOL_RESULT",
    ok: !isError,
    provider: ctx.provider,
    data: resultData,
  });

  return {};
};
