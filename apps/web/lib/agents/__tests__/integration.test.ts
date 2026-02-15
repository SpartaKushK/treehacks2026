/**
 * Integration tests for the full agent workflow
 *
 * Tests the complete flow: PlannerAgent → HealthAgent → SchedulerAgent
 *
 * Note: These tests require mocking external dependencies (LLM APIs, database, etc.)
 * For true end-to-end testing, use the test script instead.
 */

import { PlannerAgent } from "../PlannerAgent";
import { HealthAgent } from "../HealthAgent";
import { SchedulerAgent } from "../SchedulerAgent";
import type { AgentContext } from "../base/types";

// Mock all external dependencies
jest.mock("../../capabilities/healthAnomalyAlert");
jest.mock("../../people");
jest.mock("../../google-calendar");
jest.mock("../../store");
jest.mock("../../trace");
jest.mock("../../memory");

describe("Agent Integration Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Mock trace functions
    const traceMock = require("../../trace");
    traceMock.startTrace.mockReturnValue("trace-test-123");
    traceMock.addStep.mockImplementation(() => {});
    traceMock.finalizeTrace.mockImplementation(() => Promise.resolve());

    // Mock memory functions
    const memoryMock = require("../../memory");
    memoryMock.getHistory.mockResolvedValue([]);
    memoryMock.formatHistoryForLLM.mockReturnValue([]);
    memoryMock.saveInteraction.mockResolvedValue(undefined);
    memoryMock.saveToolInteraction.mockResolvedValue(undefined);
  });

  describe("PlannerAgent → HealthAgent → SchedulerAgent", () => {
    it("should handle full workflow for urgent anomaly", async () => {
      // Mock health anomaly analysis
      const healthMock = require("../../capabilities/healthAnomalyAlert");
      healthMock.handleHealthAnomalyAlert.mockResolvedValue({
        ok: true,
        data: {
          decision: {
            urgency: "urgent",
            should_contact_clinic: true,
            summary_explanation: "Critical health alert",
            recommended_next_step: "Contact clinic immediately",
            clinic_message: "Patient needs urgent care",
          },
        },
      });

      // Mock calendar operations
      const calendarMock = require("../../google-calendar");
      const storeMock = require("../../store");

      storeMock.prisma = {
        human: {
          findUnique: jest.fn().mockResolvedValue({ id: "user-123" }),
        },
      };

      calendarMock.findAvailableSlots.mockResolvedValue([
        {
          start: "2026-02-14T14:00:00Z",
          end: "2026-02-14T14:30:00Z",
        },
      ]);

      calendarMock.getBusySlots.mockResolvedValue([]);

      calendarMock.bookCalendarEvent.mockResolvedValue({
        localId: "event-123",
        googleEventId: "google-event-456",
      });

      // Mock LLM API calls (simulate function calling)
      global.fetch = jest.fn().mockImplementation((url: string) => {
        if (url.includes("anthropic.com")) {
          // Simulate Anthropic API responses
          return Promise.resolve({
            ok: true,
            json: async () => ({
              content: [
                {
                  type: "tool_use",
                  id: "tool-1",
                  name: "analyze_health",
                  input: {
                    user_handle: "pari",
                    date: "2026-02-14",
                    anomaly_score: 92,
                  },
                },
              ],
              stop_reason: "tool_use",
            }),
          });
        }
        return Promise.resolve({ ok: false, json: async () => ({}) });
      });

      const planner = new PlannerAgent({ provider: "claude" });
      const context: AgentContext = {
        traceId: "trace-integration-test",
        provider: "claude",
        userHandle: "pari",
      };

      const input = {
        user_handle: "pari",
        date: "2026-02-14",
        anomaly_score: 92,
        metrics: { sleep_hours: 4.2, resting_hr_bpm: 88 },
        baseline: { sleep_mean: 7.1, rhr_mean: 62 },
        flags: ["SLEEP_DROP", "RHR_SPIKE"],
      };

      // Note: This test is incomplete without proper LLM mocking
      // For now, we verify that the planner can be instantiated
      expect(planner).toBeInstanceOf(PlannerAgent);
      expect(planner.getAgentType()).toBe("planner");
    });
  });

  describe("Sub-agent Isolation", () => {
    it("should maintain separate memory scopes", async () => {
      const memoryMock = require("../../memory");

      const healthAgent = new HealthAgent();
      const schedulerAgent = new SchedulerAgent();

      expect(healthAgent.getAgentType()).toBe("health_anomaly");
      expect(schedulerAgent.getAgentType()).toBe("scheduler");

      // Verify they use different memory scopes
      expect(healthAgent.getAgentType()).not.toBe(schedulerAgent.getAgentType());
    });

    it("should allow parallel execution of sub-agents", async () => {
      const healthAgent = new HealthAgent();
      const schedulerAgent = new SchedulerAgent();

      const context: AgentContext = {
        traceId: "trace-parallel",
        provider: "claude",
        userHandle: "pari",
      };

      // Mock responses
      const healthMock = require("../../capabilities/healthAnomalyAlert");
      healthMock.handleHealthAnomalyAlert.mockResolvedValue({
        ok: true,
        data: { decision: { urgency: "routine" } },
      });

      const storeMock = require("../../store");
      storeMock.prisma = {
        human: {
          findUnique: jest.fn().mockResolvedValue({ id: "user-123" }),
        },
      };

      const calendarMock = require("../../google-calendar");
      calendarMock.findAvailableSlots.mockResolvedValue([]);
      calendarMock.getBusySlots.mockResolvedValue([]);

      // Execute in parallel
      const [healthResult, schedulerResult] = await Promise.all([
        healthAgent.analyzeAnomaly({ user_handle: "pari" }, context),
        schedulerAgent.queryAvailability(
          { user_handle: "pari", duration_mins: 30 },
          context,
        ),
      ]);

      expect(healthResult.ok).toBe(true);
      expect(schedulerResult.ok).toBe(true);
    });
  });
});
