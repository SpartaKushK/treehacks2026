# Implementation Checklist: Class-Based Agent Architecture

## ✅ Completed (Ready for Testing)

### Foundation & Core Infrastructure
- [x] Created abstract `Agent` base class
- [x] Defined shared types and interfaces
- [x] Implemented utility functions
- [x] Added "planner" to memory system's `AgentType` union
- [x] No database migration needed (agentType is String field)

### Agent Classes
- [x] **HealthAgent** - Health anomaly analysis
  - [x] `analyzeAnomaly()` method
  - [x] `getHealthSummary()` method
  - [x] Memory scoping to "health_anomaly"
  - [x] System prompt for health analysis

- [x] **SchedulerAgent** - Calendar management
  - [x] `scheduleAppointment()` method
  - [x] `queryAvailability()` method
  - [x] Memory scoping to "scheduler"
  - [x] Google Calendar integration
  - [x] Urgency-based scheduling

- [x] **PlannerAgent** - Main orchestrator
  - [x] Sub-agent instantiation (Health + Scheduler)
  - [x] Delegation tools (analyze_health, schedule_appointment, get_health_summary)
  - [x] LLM loop (OpenAI + Anthropic support)
  - [x] Memory scoping to "planner"
  - [x] Context propagation to sub-agents

### Integration & Feature Flag
- [x] Added `USE_CLASS_BASED_AGENTS` environment variable
- [x] Updated `/api/trigger` route with feature flag
- [x] Updated `.env.example` with documentation
- [x] Backward compatibility maintained

### Testing & Scripts
- [x] Unit tests for base Agent class
- [x] Unit tests for HealthAgent
- [x] Integration test scaffolding
- [x] Manual test script (`test-agents.ts`)
- [x] Migration script (`migrate-secretary-to-planner.ts`)

### Documentation
- [x] **AGENT_ARCHITECTURE.md** - Full architecture guide
- [x] **IMPLEMENTATION_SUMMARY.md** - What was done & next steps
- [x] **QUICKSTART_AGENTS.md** - 5-minute quick start
- [x] **IMPLEMENTATION_CHECKLIST.md** - This file
- [x] Updated main README.md with agent info

## 🧪 Testing Checklist (Before Deployment)

### Manual Testing
- [ ] Enable feature flag: `USE_CLASS_BASED_AGENTS=true`
- [ ] Start dev server: `npm run dev`
- [ ] Test API endpoint: `POST /api/trigger`
- [ ] Verify response includes tool call log
- [ ] Check database for planner conversations
- [ ] Verify sub-agent memory scoping
- [ ] Test with both OpenAI and Anthropic providers
- [ ] Test error handling (missing API keys, invalid input)

### Script Testing
- [ ] Run: `npx tsx scripts/test-agents.ts health-agent`
- [ ] Run: `npx tsx scripts/test-agents.ts scheduler-agent`
- [ ] Run: `npx tsx scripts/test-agents.ts planner-agent`
- [ ] Run: `npx tsx scripts/test-agents.ts all`
- [ ] Verify all tests pass

### Database Verification
- [ ] Query: `SELECT * FROM "AgentConversation" WHERE "agentType" = 'planner'`
- [ ] Verify planner conversations exist
- [ ] Query: `SELECT * FROM "AgentConversation" WHERE "agentType" = 'health_anomaly'`
- [ ] Verify health agent conversations exist
- [ ] Query: `SELECT * FROM "AgentConversation" WHERE "agentType" = 'scheduler'`
- [ ] Verify scheduler conversations exist
- [ ] Check message counts per agent type

### Unit Testing
- [ ] Run: `npm test lib/agents/__tests__/Agent.test.ts`
- [ ] Run: `npm test lib/agents/__tests__/HealthAgent.test.ts`
- [ ] Run: `npm test lib/agents/__tests__/integration.test.ts`
- [ ] All tests pass

### Comparison Testing (Old vs New)
- [ ] Test same input with `USE_CLASS_BASED_AGENTS=false` (old)
- [ ] Test same input with `USE_CLASS_BASED_AGENTS=true` (new)
- [ ] Compare outputs (should be functionally equivalent)
- [ ] Compare latency (should be similar)
- [ ] Compare error rates (should be similar or better)

## 📋 Pre-Deployment Checklist

### Code Review
- [ ] Review all agent classes for code quality
- [ ] Verify error handling is comprehensive
- [ ] Check memory save/load logic
- [ ] Ensure trace logging is consistent
- [ ] Verify type safety (no `any` types)

### Security Review
- [ ] Environment variables properly scoped
- [ ] No secrets in code
- [ ] Input validation on all agent methods
- [ ] SQL injection prevention (using Prisma)
- [ ] API rate limiting considered

### Performance Review
- [ ] Memory usage acceptable
- [ ] No N+1 query problems
- [ ] Proper database indexing
- [ ] LLM API calls optimized (avoid unnecessary calls)

### Documentation Review
- [ ] All new code has clear comments
- [ ] System prompts are well-documented
- [ ] API contracts are clear
- [ ] Error messages are helpful

## 🚀 Deployment Steps (Week 6)

### Phase 1: Deploy with Flag OFF
- [ ] Deploy to staging with `USE_CLASS_BASED_AGENTS=false`
- [ ] Run smoke tests
- [ ] Monitor baseline metrics (latency, errors, throughput)
- [ ] Record baseline performance

### Phase 2: Gradual Rollout
- [ ] Enable for 10% of traffic
  - [ ] Set `USE_CLASS_BASED_AGENTS=true` for 10% sample
  - [ ] Monitor for 24 hours
  - [ ] Check error rates, latency, memory usage
  - [ ] Compare to baseline

- [ ] Increase to 25% if stable
  - [ ] Monitor for 24 hours
  - [ ] Check metrics

- [ ] Increase to 50% if stable
  - [ ] Monitor for 24 hours
  - [ ] Check metrics

- [ ] Increase to 100% if stable
  - [ ] Monitor for 48 hours
  - [ ] Full rollout complete

### Phase 3: Monitoring
- [ ] Set up alerts for errors
- [ ] Monitor latency percentiles (p50, p95, p99)
- [ ] Track memory usage over time
- [ ] Monitor database query performance
- [ ] Watch LLM API costs

### Phase 4: Validation
- [ ] Run parallel testing (old vs new architecture)
- [ ] Compare outputs for equivalence (target: 95%+)
- [ ] Verify memory persistence working
- [ ] Check Google Calendar integration
- [ ] Confirm no regressions

## 🧹 Cleanup Steps (Week 7)

### After 2 Weeks Stable
- [ ] Remove feature flag from code
- [ ] Set `USE_CLASS_BASED_AGENTS=true` permanently
- [ ] Add deprecation warnings to `lib/secretary/*`
- [ ] Update all internal documentation

### Migration
- [ ] Run migration script (dry run first)
  ```bash
  npx tsx scripts/migrate-secretary-to-planner.ts --dry-run
  ```
- [ ] Review what will be migrated
- [ ] Run actual migration
  ```bash
  npx tsx scripts/migrate-secretary-to-planner.ts
  ```
- [ ] Verify data integrity
- [ ] Keep original "secretary" conversations for 30 days

### Code Cleanup
- [ ] Archive `lib/secretary/` → `lib/secretary.deprecated/`
- [ ] Remove old tool definitions if not used elsewhere
- [ ] Update imports across codebase
- [ ] Remove feature flag environment variable
- [ ] Clean up any dead code

### Documentation Cleanup
- [ ] Remove references to Secretary in user-facing docs
- [ ] Update API documentation
- [ ] Add migration guide for other developers
- [ ] Update changelog/release notes

## ⚠️ Rollback Plan

If issues arise after deployment:

### Immediate Rollback
- [ ] Set `USE_CLASS_BASED_AGENTS=false` in environment
- [ ] Redeploy application
- [ ] Verify system returns to normal
- [ ] Investigate root cause

### Longer-term Fixes
- [ ] Identify the issue from logs
- [ ] Fix the bug in staging
- [ ] Test thoroughly
- [ ] Retry rollout with fixed code

## 📊 Success Metrics

### Functional Metrics
- ✅ No increase in error rate vs. baseline
- ✅ Outputs functionally equivalent to old architecture (95%+ match)
- ✅ Memory persistence working correctly
- ✅ Sub-agents saving to correct scopes
- ✅ Google Calendar integration functioning

### Performance Metrics
- ✅ Latency within 10% of baseline
- ✅ Memory usage acceptable
- ✅ Database query count similar
- ✅ LLM API call count similar

### Code Quality Metrics
- ✅ All tests passing
- ✅ Code coverage maintained or improved
- ✅ No new linting errors
- ✅ Type safety maintained

## 📞 Support & Troubleshooting

### If Tests Fail
1. Check environment variables are set
2. Verify database connection
3. Ensure database is seeded
4. Check API keys for LLM providers
5. Review error logs for specific issues

### If Deployment Has Issues
1. Check rollback plan above
2. Review monitoring dashboards
3. Check error tracking (Sentry, etc.)
4. Review database logs
5. Contact team lead if persistent

### Common Issues & Fixes
- **Memory not persisting:** Check database permissions
- **LLM errors:** Verify API keys and rate limits
- **Google Calendar issues:** Re-authenticate OAuth
- **Feature flag not working:** Restart server after env change

## ✨ Post-Implementation

### What's Next?
- [ ] Consider adding more specialized agents
- [ ] Enable LLM loops in sub-agents
- [ ] Implement agent-to-agent communication
- [ ] Add performance monitoring dashboard
- [ ] Explore agent collaboration features

### Feedback & Iteration
- [ ] Gather feedback from team
- [ ] Identify pain points
- [ ] Plan improvements
- [ ] Document lessons learned

---

**Status:** ✅ Implementation Complete - Ready for Testing

**Last Updated:** February 14, 2026

**Next Step:** Run manual tests and verify everything works before deployment!
