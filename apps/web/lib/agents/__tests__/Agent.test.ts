/**
 * Unit tests for Agent base class
 */

import { Agent } from "../base/Agent";
import type { AgentConfig, AgentContext, AgentResult } from "../base/types";

// Concrete implementation for testing
class TestAgent extends Agent {
  async run(
    input: Record<string, unknown>,
    context: AgentContext,
  ): Promise<AgentResult> {
    return {
      ok: true,
      data: { message: "Test agent executed", input },
      traceId: context.traceId,
    };
  }
}

describe("Agent Base Class", () => {
  const testConfig: AgentConfig = {
    agentType: "health_anomaly",
    systemPrompt: "Test system prompt",
    provider: "claude",
  };

  describe("Constructor", () => {
    it("should initialize with config and tools", () => {
      const tools = [
        {
          name: "test_tool",
          description: "A test tool",
          parameters: {},
          execute: async () => ({ success: true }),
        },
      ];

      const agent = new TestAgent(testConfig, tools);

      expect(agent.getAgentType()).toBe("health_anomaly");
      expect(agent.getSystemPrompt()).toBe("Test system prompt");
      expect(agent["tools"]).toHaveLength(1);
    });

    it("should initialize with empty tools array by default", () => {
      const agent = new TestAgent(testConfig);
      expect(agent["tools"]).toHaveLength(0);
    });
  });

  describe("getAgentType", () => {
    it("should return the agent type", () => {
      const agent = new TestAgent(testConfig);
      expect(agent.getAgentType()).toBe("health_anomaly");
    });
  });

  describe("getSystemPrompt", () => {
    it("should return the system prompt", () => {
      const agent = new TestAgent(testConfig);
      expect(agent.getSystemPrompt()).toBe("Test system prompt");
    });
  });

  describe("buildSubContext", () => {
    it("should preserve context and add parent agent", () => {
      const agent = new TestAgent(testConfig);
      const parentContext: AgentContext = {
        traceId: "trace-123",
        provider: "claude",
        userHandle: "test_user",
        triggerData: { test: "data" },
      };

      const subContext = agent["buildSubContext"](parentContext);

      expect(subContext.traceId).toBe("trace-123");
      expect(subContext.provider).toBe("claude");
      expect(subContext.userHandle).toBe("test_user");
      expect(subContext.parentAgent).toBe("health_anomaly");
      expect(subContext.triggerData).toEqual({ test: "data" });
    });
  });

  describe("run", () => {
    it("should execute the agent logic", async () => {
      const agent = new TestAgent(testConfig);
      const context: AgentContext = {
        traceId: "trace-123",
        provider: "claude",
        userHandle: "test_user",
      };

      const result = await agent.run({ test: "input" }, context);

      expect(result.ok).toBe(true);
      expect(result.data.message).toBe("Test agent executed");
      expect(result.data.input).toEqual({ test: "input" });
      expect(result.traceId).toBe("trace-123");
    });
  });
});
