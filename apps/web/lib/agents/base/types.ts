/**
 * Shared types for the class-based agent architecture
 */

import type { AgentType } from "../../memory";

/* ------------------------------------------------------------------ */
/*  Agent Configuration                                                */
/* ------------------------------------------------------------------ */

export interface AgentConfig {
  /** Agent type identifier (used for memory scoping) */
  agentType: AgentType;
  /** System prompt for this agent */
  systemPrompt: string;
  /** LLM provider to use */
  provider?: "openai" | "claude";
  /** Optional model override */
  model?: string;
}

/* ------------------------------------------------------------------ */
/*  Tool Definition (re-export from existing tools.ts)                */
/* ------------------------------------------------------------------ */

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema object
  execute: (
    args: Record<string, unknown>,
    ctx: ToolContext,
  ) => Promise<Record<string, unknown>>;
}

export interface ToolContext {
  traceId: string;
  provider: "openai" | "claude";
  /** Original trigger data — tools can use this to fill in missing fields */
  triggerData?: Record<string, unknown>;
  /** Parent agent context (for sub-agent delegation) */
  parentAgent?: string;
  /** User handle for memory scoping */
  userHandle?: string;
}

/* ------------------------------------------------------------------ */
/*  Agent Execution Context                                            */
/* ------------------------------------------------------------------ */

export interface AgentContext {
  /** Trace ID for observability */
  traceId: string;
  /** LLM provider to use */
  provider: "openai" | "claude";
  /** User handle for memory scoping */
  userHandle: string;
  /** Original trigger data */
  triggerData?: Record<string, unknown>;
  /** Parent agent (for sub-agent delegation) */
  parentAgent?: string;
  /** Prior conversation history */
  priorHistory?: Array<{ role: "user" | "assistant"; content: string }>;
}

/* ------------------------------------------------------------------ */
/*  Agent Result                                                       */
/* ------------------------------------------------------------------ */

export interface AgentResult {
  /** Success status */
  ok: boolean;
  /** Result data or error details */
  data: Record<string, unknown>;
  /** Trace ID for this execution */
  traceId?: string;
  /** Number of LLM turns taken (if applicable) */
  turns?: number;
  /** Tool calls made during execution */
  toolCalls?: Array<{
    tool: string;
    args: Record<string, unknown>;
    result: Record<string, unknown>;
  }>;
}
