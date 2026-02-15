/**
 * Agent Base Class
 *
 * Abstract base class for all agents in the hierarchical architecture.
 * Provides common functionality for memory loading/saving, tool management,
 * and execution context handling.
 */

import {
  getHistory,
  formatHistoryForLLM,
  saveInteraction,
  saveToolInteraction,
  type MemoryMessage,
} from "../../memory";
import type {
  AgentConfig,
  AgentContext,
  AgentResult,
  ToolDefinition,
} from "./types";

export abstract class Agent {
  protected config: AgentConfig;
  protected tools: ToolDefinition[];

  constructor(config: AgentConfig, tools: ToolDefinition[] = []) {
    this.config = config;
    this.tools = tools;
  }

  /* ------------------------------------------------------------------ */
  /*  Abstract Methods (must be implemented by subclasses)              */
  /* ------------------------------------------------------------------ */

  /**
   * Main entry point for agent execution.
   * Subclasses implement their specific execution logic here.
   */
  abstract run(
    input: Record<string, unknown>,
    context: AgentContext,
  ): Promise<AgentResult>;

  /* ------------------------------------------------------------------ */
  /*  Protected Methods (available to subclasses)                       */
  /* ------------------------------------------------------------------ */

  /**
   * Get the tools available to this agent (for LLM function calling).
   */
  protected getTools(): ToolDefinition[] {
    return this.tools;
  }

  /**
   * Load conversation history for this agent + user.
   * Returns formatted messages ready for LLM injection.
   */
  protected async loadHistory(
    userHandle: string,
    maxMessages: number = 40,
  ): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
    try {
      const rawHistory: MemoryMessage[] = await getHistory(
        this.config.agentType,
        userHandle,
      );
      return formatHistoryForLLM(rawHistory, maxMessages);
    } catch (e) {
      console.warn(
        `[${this.config.agentType}] Failed to load history for ${userHandle}:`,
        e,
      );
      return [];
    }
  }

  /**
   * Save a full interaction (user input + agent response) to this agent's memory.
   */
  protected async saveToMemory(
    userHandle: string,
    userContent: string,
    assistantContent: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await saveInteraction(
        this.config.agentType,
        userHandle,
        userContent,
        assistantContent,
        metadata,
      );
    } catch (e) {
      console.warn(
        `[${this.config.agentType}] Failed to save interaction for ${userHandle}:`,
        e,
      );
    }
  }

  /**
   * Save a tool call + result pair to this agent's memory.
   */
  protected async saveToolToMemory(
    userHandle: string,
    toolName: string,
    toolArgs: Record<string, unknown>,
    toolResult: Record<string, unknown>,
  ): Promise<void> {
    try {
      await saveToolInteraction(
        this.config.agentType,
        userHandle,
        toolName,
        toolArgs,
        toolResult,
      );
    } catch (e) {
      console.warn(
        `[${this.config.agentType}] Failed to save tool interaction for ${userHandle}:`,
        e,
      );
    }
  }

  /**
   * Build a sub-context for delegating to child agents.
   * Preserves traceId, provider, userHandle, and adds parent agent info.
   */
  protected buildSubContext(parentContext: AgentContext): AgentContext {
    return {
      ...parentContext,
      parentAgent: this.config.agentType,
    };
  }

  /* ------------------------------------------------------------------ */
  /*  Public Getters                                                    */
  /* ------------------------------------------------------------------ */

  /**
   * Get the agent type identifier.
   */
  public getAgentType(): string {
    return this.config.agentType;
  }

  /**
   * Get the system prompt for this agent.
   */
  public getSystemPrompt(): string {
    return this.config.systemPrompt;
  }
}
