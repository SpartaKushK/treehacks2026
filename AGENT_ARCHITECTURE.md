# Class-Based Hierarchical Agent Architecture

## Overview

This project now supports a **class-based hierarchical agent architecture** as an alternative to the legacy tool-based delegation system. The new architecture provides better separation of concerns, clearer code organization, and easier extensibility.

## Architecture Diagram

```
PlannerAgent (orchestrator)
├── HealthAgent (health analysis)
│   ├── analyzeAnomaly()
│   └── getHealthSummary()
└── SchedulerAgent (calendar management)
    ├── scheduleAppointment()
    └── queryAvailability()
```

## Key Concepts

### 1. Agent Base Class

All agents extend the abstract `Agent` base class, which provides:
- Memory management (loading/saving conversation history per agent type)
- Tool definition management
- Context propagation for sub-agent delegation
- Standardized execution interface

**Location:** `apps/web/lib/agents/base/Agent.ts`

### 2. Hierarchical Delegation

The `PlannerAgent` is the main orchestrator that:
- Receives incoming health triggers
- Runs an LLM-powered agentic loop
- Delegates to specialized sub-agents via tool calls
- Maintains its own conversation history

Sub-agents (`HealthAgent`, `SchedulerAgent`) handle domain-specific tasks and maintain separate conversation histories per user.

### 3. Memory Scoping

Each agent type has its own memory scope in the database:
- `planner` - Main orchestrator conversations
- `health_anomaly` - Health analysis interactions
- `scheduler` - Calendar/scheduling interactions

This allows each agent to build context over time while keeping concerns separated.

## Agent Classes

### PlannerAgent

**Purpose:** Main orchestrator for health management workflows

**Location:** `apps/web/lib/agents/PlannerAgent.ts`

**Tools (exposed to LLM):**
- `analyze_health` - Delegates to HealthAgent
- `get_health_summary` - Delegates to HealthAgent
- `schedule_appointment` - Delegates to SchedulerAgent

**Example Usage:**
```typescript
import { PlannerAgent } from "@/lib/agents";

const planner = new PlannerAgent({ provider: "claude" });

const result = await planner.run(triggerData, {
  traceId: "trace-123",
  provider: "claude",
  userHandle: "pari",
  triggerData: { /* health anomaly data */ },
});

console.log(result.data.finalDecision);
```

### HealthAgent

**Purpose:** Analyze health anomalies and provide health summaries

**Location:** `apps/web/lib/agents/HealthAgent.ts`

**Methods:**
- `analyzeAnomaly(input, context)` - Analyzes wearable health data, determines urgency
- `getHealthSummary(input, context)` - Retrieves 30-day health trends

**Example Usage:**
```typescript
import { HealthAgent } from "@/lib/agents";

const healthAgent = new HealthAgent({ provider: "claude" });

const result = await healthAgent.analyzeAnomaly(anomalyData, {
  traceId: "trace-123",
  provider: "claude",
  userHandle: "pari",
});

console.log(result.data.urgency); // "urgent" | "soon" | "routine"
```

### SchedulerAgent

**Purpose:** Manage calendar and appointment scheduling

**Location:** `apps/web/lib/agents/SchedulerAgent.ts`

**Methods:**
- `scheduleAppointment(input, context)` - Finds free slots and books appointments
- `queryAvailability(input, context)` - Queries available time slots without booking

**Example Usage:**
```typescript
import { SchedulerAgent } from "@/lib/agents";

const scheduler = new SchedulerAgent({ provider: "claude" });

const result = await scheduler.scheduleAppointment({
  user_handle: "pari",
  title: "Medical Appointment",
  urgency: "urgent",
  duration_mins: 30,
}, {
  traceId: "trace-123",
  provider: "claude",
  userHandle: "pari",
});

console.log(result.data.booking); // { start, end, method, title }
```

## Feature Flag

The new architecture is controlled by the `USE_CLASS_BASED_AGENTS` environment variable:

```bash
# Use new class-based architecture
USE_CLASS_BASED_AGENTS=true

# Use legacy Secretary agent architecture (default)
USE_CLASS_BASED_AGENTS=false
```

## API Endpoints

### POST `/api/trigger`

Main entry point for triggering agent workflows. Automatically uses the architecture specified by `USE_CLASS_BASED_AGENTS`.

**Request:**
```json
{
  "trigger_type": "health_anomaly",
  "provider": "claude",
  "data": {
    "user_handle": "pari",
    "date": "2026-02-14",
    "anomaly_score": 92,
    "metrics": { "sleep_hours": 4.2, "resting_hr_bpm": 88 },
    "baseline": { "sleep_mean": 7.1, "rhr_mean": 62 },
    "flags": ["SLEEP_DROP", "RHR_SPIKE"]
  },
  "description": "Severe health anomaly detected"
}
```

**Response:**
```json
{
  "traceId": "uuid",
  "finalDecision": "Planner's summary of actions taken...",
  "toolCallLog": [
    {
      "tool": "analyze_health",
      "args": { "user_handle": "pari", ... },
      "result": { "urgency": "urgent", ... }
    },
    {
      "tool": "schedule_appointment",
      "args": { "user_handle": "pari", ... },
      "result": { "scheduled": true, ... }
    }
  ],
  "provider": "claude",
  "turns": 2
}
```

## Migration Path

### Phase 1: Development & Testing (Completed)
✅ Implement base Agent infrastructure
✅ Implement HealthAgent, SchedulerAgent, PlannerAgent
✅ Add feature flag support
✅ Update API routes

### Phase 2: Gradual Rollout (Pending)
- Deploy with `USE_CLASS_BASED_AGENTS=false` (default)
- Monitor baseline metrics
- Enable for 10% of traffic
- Gradually increase to 100%

### Phase 3: Cleanup (Pending)
- Remove feature flag after stable operation
- Deprecate legacy `lib/secretary/` code
- Migrate existing "secretary" conversations to "planner"
- Update documentation

## Benefits of New Architecture

1. **Better Separation of Concerns**
   - Each agent has a single, well-defined responsibility
   - Domain logic is encapsulated in agent classes
   - Tools are grouped by agent type

2. **Clearer Code Organization**
   - Agent classes are easier to understand and test
   - Memory scoping is explicit and type-safe
   - Sub-agent delegation is visible in code structure

3. **Easier Extensibility**
   - Adding new agents is straightforward (extend `Agent` base class)
   - New capabilities can be added without modifying core orchestrator
   - Sub-agents can be composed in different ways

4. **Improved Testability**
   - Each agent can be unit tested in isolation
   - Mock sub-agents for integration tests
   - Memory scoping makes state management predictable

## Backward Compatibility

The legacy Secretary agent architecture remains fully functional when `USE_CLASS_BASED_AGENTS=false`. Both architectures share:
- The same database schema
- The same capability handlers
- The same trace/observability system
- The same Google Calendar integration

This allows for safe migration with zero downtime.

## Future Enhancements

Potential improvements to the agent architecture:

1. **Add more specialized agents:**
   - MedicationAgent for prescription management
   - NotificationAgent for patient communications
   - AnalyticsAgent for trend analysis

2. **Enable LLM loops in sub-agents:**
   - SchedulerAgent could use LLM to negotiate appointment times
   - HealthAgent could ask follow-up questions

3. **Add agent collaboration:**
   - Agents could communicate directly with each other
   - Shared working memory for collaborative tasks

4. **Implement agent monitoring:**
   - Per-agent performance metrics
   - Conversation quality scoring
   - Automated A/B testing

## Troubleshooting

### Memory not persisting
- Check that `AgentConversation.agentType` matches the agent's configured type
- Verify database connection and Prisma schema
- Check logs for memory save errors

### Sub-agent delegation failing
- Verify `AgentContext` is properly propagated
- Check that `userHandle` is correctly extracted
- Ensure sub-agent constructors are called with correct config

### Feature flag not working
- Verify `USE_CLASS_BASED_AGENTS` environment variable is set
- Check that env vars are loaded in your deployment environment
- Look for console logs indicating which architecture is being used

## Contributing

When adding new agents or modifying the architecture:

1. Extend the `Agent` base class
2. Define a unique `agentType` (add to `AgentType` union in `memory.ts`)
3. Implement the abstract `run()` method
4. Use `loadHistory()` and `saveToMemory()` for memory management
5. Add tests in `__tests__/` directory
6. Update this documentation

## References

- Base Agent class: `apps/web/lib/agents/base/Agent.ts`
- Agent types: `apps/web/lib/agents/base/types.ts`
- Memory system: `apps/web/lib/memory.ts`
- Legacy Secretary: `apps/web/lib/secretary/agent.ts` (deprecated)
