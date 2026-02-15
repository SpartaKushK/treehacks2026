# Quick Start: Class-Based Agent Architecture

This guide will help you get started with the new class-based hierarchical agent architecture in under 5 minutes.

## Prerequisites

- Node.js installed
- Database set up (Supabase)
- Environment variables configured (`.env` file)

## 1. Enable the New Architecture

Add to your `.env` file:

```bash
USE_CLASS_BASED_AGENTS=true
```

## 2. Start the Development Server

```bash
cd apps/web
npm run dev
```

## 3. Test the API

### Option A: Using curl

```bash
curl -X POST http://localhost:3000/api/trigger \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "claude",
    "data": {
      "user_handle": "pari",
      "date": "2026-02-14",
      "anomaly_score": 92,
      "metrics": {
        "sleep_hours": 4.2,
        "resting_hr_bpm": 88,
        "steps": 2100
      },
      "baseline": {
        "sleep_mean": 7.1,
        "rhr_mean": 62,
        "steps_mean": 7500
      },
      "flags": ["SLEEP_DROP", "RHR_SPIKE"]
    }
  }'
```

### Option B: Using the Test Script

```bash
# Test individual agents
npx tsx scripts/test-agents.ts health-agent
npx tsx scripts/test-agents.ts scheduler-agent
npx tsx scripts/test-agents.ts planner-agent

# Test everything
npx tsx scripts/test-agents.ts all
```

## 4. Verify It's Working

### Check the Response

You should see a response like:

```json
{
  "traceId": "uuid-here",
  "finalDecision": "Based on the health analysis, I've identified an urgent situation...",
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

### Check the Database

```sql
-- Verify planner conversations are being created
SELECT * FROM "AgentConversation" WHERE "agentType" = 'planner';

-- Check sub-agent conversations
SELECT * FROM "AgentConversation" WHERE "agentType" = 'health_anomaly';
SELECT * FROM "AgentConversation" WHERE "agentType" = 'scheduler';

-- Count messages per agent type
SELECT ac."agentType", COUNT(am.id) as message_count
FROM "AgentConversation" ac
LEFT JOIN "AgentMessage" am ON ac.id = am."conversationId"
GROUP BY ac."agentType";
```

### Check the Logs

Look for these log messages:

```
[PlannerAgent] Loading history for user: pari
[planner] WORKFLOW_START
[health_agent] ANALYZE_START
[scheduler_agent] SCHEDULE_START
```

## 5. Using the Agents Programmatically

### HealthAgent Example

```typescript
import { HealthAgent } from "@/lib/agents";

const healthAgent = new HealthAgent({ provider: "claude" });

const result = await healthAgent.analyzeAnomaly(anomalyData, {
  traceId: "trace-123",
  provider: "claude",
  userHandle: "pari",
});

console.log("Urgency:", result.data.urgency);
console.log("Contact clinic:", result.data.should_contact_clinic);
```

### SchedulerAgent Example

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

if (result.data.scheduled) {
  console.log("Booked:", result.data.booking);
}
```

### PlannerAgent Example

```typescript
import { PlannerAgent } from "@/lib/agents";

const planner = new PlannerAgent({ provider: "claude" });

const result = await planner.run(triggerData, {
  traceId: "trace-123",
  provider: "claude",
  userHandle: "pari",
  triggerData: anomalyData,
});

console.log("Final decision:", result.data.finalDecision);
console.log("Tools called:", result.toolCalls?.length);
```

## 6. Switching Between Architectures

### Use New Architecture
```bash
USE_CLASS_BASED_AGENTS=true
```

### Use Old Architecture (Secretary)
```bash
USE_CLASS_BASED_AGENTS=false
# or just omit the variable
```

### Compare Results

Run the same request with both architectures and compare:

```bash
# Test with new architecture
USE_CLASS_BASED_AGENTS=true npm run dev
# ... make API call ...

# Test with old architecture
USE_CLASS_BASED_AGENTS=false npm run dev
# ... make same API call ...

# Compare responses, latency, and behavior
```

## 7. Migrate Existing Data (Optional)

If you have existing "secretary" conversations that you want to preserve in the new "planner" scope:

```bash
# Dry run (see what would be migrated)
npx tsx scripts/migrate-secretary-to-planner.ts --dry-run

# Perform migration
npx tsx scripts/migrate-secretary-to-planner.ts
```

**Note:** Original secretary conversations are preserved for rollback.

## 8. Running Tests

```bash
# Unit tests
npm test lib/agents/__tests__/Agent.test.ts
npm test lib/agents/__tests__/HealthAgent.test.ts

# Integration tests
npm test lib/agents/__tests__/integration.test.ts

# Manual tests
npx tsx scripts/test-agents.ts all
```

## Common Issues

### "Agent not found" Error
- Check that `USE_CLASS_BASED_AGENTS=true` is set
- Restart your dev server after changing env vars

### Memory Not Persisting
- Verify database connection
- Check that `AgentConversation.agentType` allows "planner"
- Look for error logs when saving to memory

### LLM API Errors
- Verify `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` is set
- Check API rate limits
- System will fall back to deterministic mode if no API key

### Google Calendar Not Working
- Verify `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set
- Complete OAuth flow first
- System will save events locally if Google Calendar not connected

## Next Steps

1. **Read the full documentation:** See `AGENT_ARCHITECTURE.md`
2. **Review the implementation:** Check `IMPLEMENTATION_SUMMARY.md`
3. **Write custom agents:** Extend the `Agent` base class
4. **Add new tools:** Implement new delegation methods
5. **Monitor performance:** Track latency and error rates

## Getting Help

- Check logs for detailed error messages
- Review `AGENT_ARCHITECTURE.md` for troubleshooting
- Compare behavior with old architecture (`USE_CLASS_BASED_AGENTS=false`)
- Open an issue if you encounter bugs

## Resources

- **Architecture docs:** `AGENT_ARCHITECTURE.md`
- **Implementation summary:** `IMPLEMENTATION_SUMMARY.md`
- **Base Agent class:** `apps/web/lib/agents/base/Agent.ts`
- **PlannerAgent:** `apps/web/lib/agents/PlannerAgent.ts`
- **HealthAgent:** `apps/web/lib/agents/HealthAgent.ts`
- **SchedulerAgent:** `apps/web/lib/agents/SchedulerAgent.ts`

---

**Ready to build?** Start by enabling the feature flag and testing the API! 🚀
