/**
 * Unit tests for HealthAgent
 */

import { HealthAgent } from "../HealthAgent";
import type { AgentContext } from "../base/types";
import * as healthCapability from "../../capabilities/healthAnomalyAlert";
import * as people from "../../people";

// Mock dependencies
jest.mock("../../capabilities/healthAnomalyAlert");
jest.mock("../../people");
jest.mock("../../trace");
jest.mock("../../memory");

describe("HealthAgent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Constructor", () => {
    it("should initialize with correct agent type", () => {
      const agent = new HealthAgent();
      expect(agent.getAgentType()).toBe("health_anomaly");
    });

    it("should accept custom config", () => {
      const agent = new HealthAgent({ provider: "openai" });
      expect(agent.getAgentType()).toBe("health_anomaly");
      expect(agent["config"].provider).toBe("openai");
    });
  });

  describe("analyzeAnomaly", () => {
    it("should analyze health anomaly and return result", async () => {
      const mockResult = {
        ok: true,
        data: {
          decision: {
            urgency: "urgent",
            should_contact_clinic: true,
            summary_explanation: "Critical health alert",
            recommended_next_step: "Contact clinic immediately",
            clinic_message: "Patient has severe symptoms",
          },
        },
      };

      (healthCapability.handleHealthAnomalyAlert as jest.Mock).mockResolvedValue(
        mockResult,
      );

      const agent = new HealthAgent({ provider: "claude" });
      const context: AgentContext = {
        traceId: "trace-123",
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

      const result = await agent.analyzeAnomaly(input, context);

      expect(result.ok).toBe(true);
      expect(result.data.urgency).toBe("urgent");
      expect(result.data.should_contact_clinic).toBe(true);
      expect(healthCapability.handleHealthAnomalyAlert).toHaveBeenCalledWith(
        input,
        "trace-123",
        "claude",
      );
    });

    it("should handle errors gracefully", async () => {
      const mockError = {
        ok: false,
        data: { error: "Analysis failed" },
      };

      (healthCapability.handleHealthAnomalyAlert as jest.Mock).mockResolvedValue(
        mockError,
      );

      const agent = new HealthAgent();
      const context: AgentContext = {
        traceId: "trace-123",
        provider: "claude",
        userHandle: "pari",
      };

      const result = await agent.analyzeAnomaly(
        { user_handle: "pari", anomaly_score: 50 },
        context,
      );

      expect(result.ok).toBe(false);
      expect(result.data.error).toBe(true);
    });
  });

  describe("getHealthSummary", () => {
    it("should retrieve health summary", async () => {
      const mockSummary = {
        ok: true,
        data: {
          rangeDays: 30,
          sleep: { avg: 7.2, trend: "up", flags: [] },
          activity: { avgSteps: 8500, trend: "up" },
          medication: { adherencePct: 95, missedDays: 1 },
          symptoms: { avgScore: 2.1, spikes: [] },
          notes: ["Overall improving trend"],
        },
      };

      (people.handleCapability as jest.Mock).mockResolvedValue(mockSummary);

      const agent = new HealthAgent();
      const context: AgentContext = {
        traceId: "trace-456",
        provider: "claude",
        userHandle: "pari",
      };

      const result = await agent.getHealthSummary(
        { patient_handle: "pari" },
        context,
      );

      expect(result.ok).toBe(true);
      expect(result.data.rangeDays).toBe(30);
      expect(people.handleCapability).toHaveBeenCalledWith(
        "pari",
        "health_summary",
        { patientHandle: "pari" },
      );
    });
  });

  describe("run", () => {
    it("should delegate to analyzeAnomaly", async () => {
      const agent = new HealthAgent();
      const analyzeSpy = jest.spyOn(agent, "analyzeAnomaly");

      const context: AgentContext = {
        traceId: "trace-789",
        provider: "claude",
        userHandle: "pari",
      };

      await agent.run({ user_handle: "pari" }, context);

      expect(analyzeSpy).toHaveBeenCalled();
    });
  });
});
