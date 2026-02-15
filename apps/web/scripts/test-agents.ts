/**
 * Manual test script for the class-based agent architecture
 *
 * Usage:
 *   npx tsx scripts/test-agents.ts [test-name]
 *
 * Available tests:
 *   - health-agent      Test HealthAgent in isolation
 *   - scheduler-agent   Test SchedulerAgent in isolation
 *   - planner-agent     Test PlannerAgent (full workflow)
 *   - all               Run all tests
 */

import { PlannerAgent, HealthAgent, SchedulerAgent } from "../lib/agents";
import type { AgentContext } from "../lib/agents/base/types";
import { ensureSeed } from "../lib/ensureSeed";

const COLORS = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

function log(message: string, color: keyof typeof COLORS = "reset") {
  console.log(`${COLORS[color]}${message}${COLORS.reset}`);
}

function section(title: string) {
  log(`\n${"=".repeat(60)}`, "cyan");
  log(`  ${title}`, "bright");
  log("=".repeat(60), "cyan");
}

function success(message: string) {
  log(`✅ ${message}`, "green");
}

function error(message: string) {
  log(`❌ ${message}`, "red");
}

function info(message: string) {
  log(`ℹ️  ${message}`, "blue");
}

// Sample anomaly data
const SEVERE_ANOMALY = {
  user_handle: "pari",
  date: new Date().toISOString().split("T")[0],
  baseline_window_days: 28,
  metrics: { sleep_hours: 4.2, resting_hr_bpm: 88, steps: 2100, hrv_ms: 22 },
  baseline: {
    sleep_mean: 7.1,
    sleep_std: 0.6,
    rhr_mean: 62,
    rhr_std: 3,
    steps_mean: 7500,
    steps_std: 1200,
  },
  flags: ["SLEEP_DROP", "RHR_SPIKE", "STEPS_DROP", "HRV_DROP"],
  anomaly_score: 92,
  freeform_context: "Feeling very tired and heart racing since yesterday.",
};

const MILD_ANOMALY = {
  user_handle: "pari",
  date: new Date().toISOString().split("T")[0],
  baseline_window_days: 28,
  metrics: { sleep_hours: 5.8, resting_hr_bpm: 68, steps: 5200 },
  baseline: {
    sleep_mean: 7.1,
    sleep_std: 0.6,
    rhr_mean: 62,
    rhr_std: 3,
    steps_mean: 7500,
    steps_std: 1200,
  },
  flags: ["SLEEP_DROP"],
  anomaly_score: 55,
};

async function testHealthAgent() {
  section("Testing HealthAgent");

  try {
    const agent = new HealthAgent({ provider: "claude" });
    info(`Agent type: ${agent.getAgentType()}`);

    const context: AgentContext = {
      traceId: `test-health-${Date.now()}`,
      provider: "claude",
      userHandle: "pari",
    };

    // Test 1: Analyze severe anomaly
    log("\n1. Analyzing SEVERE anomaly (score: 92)...", "yellow");
    const result1 = await agent.analyzeAnomaly(SEVERE_ANOMALY, context);

    if (result1.ok) {
      success("Severe anomaly analysis completed");
      console.log("   Urgency:", result1.data.urgency);
      console.log("   Contact clinic:", result1.data.should_contact_clinic);
      console.log(
        "   Summary:",
        (result1.data.summary_explanation as string)?.slice(0, 100) + "...",
      );
    } else {
      error("Severe anomaly analysis failed");
      console.log("   Error:", result1.data);
    }

    // Test 2: Analyze mild anomaly
    log("\n2. Analyzing MILD anomaly (score: 55)...", "yellow");
    const result2 = await agent.analyzeAnomaly(MILD_ANOMALY, context);

    if (result2.ok) {
      success("Mild anomaly analysis completed");
      console.log("   Urgency:", result2.data.urgency);
      console.log("   Contact clinic:", result2.data.should_contact_clinic);
    } else {
      error("Mild anomaly analysis failed");
    }

    // Test 3: Get health summary
    log("\n3. Getting health summary...", "yellow");
    const result3 = await agent.getHealthSummary(
      { patient_handle: "pari" },
      context,
    );

    if (result3.ok) {
      success("Health summary retrieved");
      console.log("   Range:", result3.data.rangeDays, "days");
      console.log(
        "   Sleep avg:",
        result3.data.sleep?.avg || "N/A",
        "hours",
      );
    } else {
      error("Health summary failed");
      console.log("   Error:", result3.data);
    }

    success("\n✓ HealthAgent tests completed");
  } catch (err) {
    error(`\n✗ HealthAgent tests failed: ${err}`);
    console.error(err);
  }
}

async function testSchedulerAgent() {
  section("Testing SchedulerAgent");

  try {
    const agent = new SchedulerAgent({ provider: "claude" });
    info(`Agent type: ${agent.getAgentType()}`);

    const context: AgentContext = {
      traceId: `test-scheduler-${Date.now()}`,
      provider: "claude",
      userHandle: "pari",
    };

    // Test 1: Query availability
    log("\n1. Querying availability...", "yellow");
    const result1 = await agent.queryAvailability(
      {
        user_handle: "pari",
        duration_mins: 30,
      },
      context,
    );

    if (result1.ok) {
      success("Availability query completed");
      console.log(
        "   Free slots found:",
        result1.data.available_slots?.length || 0,
      );
      console.log("   Busy events:", result1.data.busy_events_count || 0);
    } else {
      error("Availability query failed");
      console.log("   Error:", result1.data);
    }

    // Test 2: Schedule urgent appointment
    log("\n2. Scheduling URGENT appointment...", "yellow");
    const result2 = await agent.scheduleAppointment(
      {
        user_handle: "pari",
        title: "Medical Appointment — Urgent",
        urgency: "urgent",
        duration_mins: 30,
      },
      context,
    );

    if (result2.ok) {
      if (result2.data.scheduled) {
        success("Urgent appointment scheduled");
        console.log("   Start:", result2.data.booking?.start);
        console.log("   Method:", result2.data.booking?.method);
        console.log(
          "   Google synced:",
          result2.data.google_calendar?.synced ? "Yes" : "No",
        );
      } else {
        info("No slots available for urgent appointment");
        console.log("   Reason:", result2.data.message);
      }
    } else {
      error("Scheduling failed");
      console.log("   Error:", result2.data);
    }

    success("\n✓ SchedulerAgent tests completed");
  } catch (err) {
    error(`\n✗ SchedulerAgent tests failed: ${err}`);
    console.error(err);
  }
}

async function testPlannerAgent() {
  section("Testing PlannerAgent (Full Workflow)");

  try {
    const agent = new PlannerAgent({ provider: "claude" });
    info(`Agent type: ${agent.getAgentType()}`);

    const context: AgentContext = {
      traceId: `test-planner-${Date.now()}`,
      provider: "claude",
      userHandle: "pari",
    };

    // Test: Full workflow with severe anomaly
    log("\n1. Running full workflow with SEVERE anomaly...", "yellow");
    log("   This will delegate to HealthAgent and SchedulerAgent", "blue");

    const result = await agent.run(SEVERE_ANOMALY, context);

    if (result.ok) {
      success("Planner workflow completed");
      console.log("   Trace ID:", result.traceId);
      console.log("   Turns:", result.turns);
      console.log("   Tool calls:", result.toolCalls?.length || 0);

      if (result.toolCalls && result.toolCalls.length > 0) {
        log("\n   Tool Call Log:", "blue");
        for (const call of result.toolCalls) {
          console.log(`     - ${call.tool}`);
        }
      }

      log("\n   Final Decision:", "blue");
      console.log(
        `     ${(result.data.finalDecision as string)?.slice(0, 200)}...`,
      );
    } else {
      error("Planner workflow failed");
      console.log("   Error:", result.data);
    }

    success("\n✓ PlannerAgent tests completed");
  } catch (err) {
    error(`\n✗ PlannerAgent tests failed: ${err}`);
    console.error(err);
  }
}

async function runAllTests() {
  log("\n🧪 Running All Agent Tests", "bright");
  log("=" .repeat(60), "cyan");

  await testHealthAgent();
  await testSchedulerAgent();
  await testPlannerAgent();

  log("\n" + "=".repeat(60), "cyan");
  success("All tests completed!");
  log("=".repeat(60) + "\n", "cyan");
}

// Main
async function main() {
  const testName = process.argv[2] || "all";

  log("\n🤖 Class-Based Agent Architecture Test Suite", "bright");
  log("=" .repeat(60), "cyan");

  // Ensure database is seeded
  info("Initializing database...");
  await ensureSeed();

  switch (testName) {
    case "health-agent":
      await testHealthAgent();
      break;
    case "scheduler-agent":
      await testSchedulerAgent();
      break;
    case "planner-agent":
      await testPlannerAgent();
      break;
    case "all":
      await runAllTests();
      break;
    default:
      error(`Unknown test: ${testName}`);
      console.log("\nAvailable tests:");
      console.log("  - health-agent");
      console.log("  - scheduler-agent");
      console.log("  - planner-agent");
      console.log("  - all");
      process.exit(1);
  }

  log("\n✨ Done!\n", "green");
}

main().catch((err) => {
  error(`\n💥 Test suite failed: ${err}`);
  console.error(err);
  process.exit(1);
});
