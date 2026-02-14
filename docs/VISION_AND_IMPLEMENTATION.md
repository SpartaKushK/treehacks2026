# Vision alignment: feedback, inefficiencies, implementation

## 1. Feedback and inefficiencies

### 1.1 Gaps vs. vision

| Gap | Current state | What’s needed |
|-----|----------------|---------------|
| **No main agent / chat** | No chat UI; no “one agent that owns conversation and routes to subagents.” | One main agent per user (conversational front door); chat stored and used as context. |
| **No alert ingestion** | No endpoint for the health monitoring app (e.g. iOS) to POST alerts. | POST endpoint (auth’d) that receives alerts, resolves user, invokes that user’s health subagent, and acts on `recommend_scheduling`. |
| **Health → scheduling is demo-only** | Demo anomaly route hardcodes pari → dr_smith and calls **triage** (intake), not the generic “scheduling endpoint.” | Health agent’s **explicit output** (`should_contact_clinic` / `recommend_scheduling`) should drive a single, reusable flow that talks to **any** doctor’s scheduling agent (propose/counter/confirm). |
| **No chat context for health** | Health subagent is invoked with only anomaly/event payload. | When invoking health (e.g. from alert), optionally pass recent chat-derived context so the actor can “gather further context.” |
| **Trace not scoped to user** | `Trace` has no `userId`/`humanId`; trace-by-id is public. | For alert-driven and chat-driven flows, associate traces with the user (or main agent) for scoping and future auth. |
| **Scheduling flow tied to demo** | Multi-turn schedule (propose/counter/confirm) lives in demo route and is signed as pari. | Reusable “orchestrator” or internal helper: given (callerHandle, calleeHandle, title, window), run propose/counter/confirm so it can be triggered from alert flow (patient = caller, doctor = callee). |

### 1.2 Existing inefficiencies (from earlier review)

- **`toHex` duplicated** in multiple files; use `@/lib/crypto` everywhere.
- **Nonces in-memory** → lost on restart / not shared across instances; OK for MVP, document or persist later.
- **Private keys in-memory** → demo-only; document; for production use a secrets store.
- **Trace `child_calls`** not persisted in DB when finalizing; only in live buffer. Persist in `stepsJson` or a column so trace view after finalize shows full graph.
- **Capability handlers** (e.g. `handleSchedulePropose`) use `input as {...}` without Zod; validate with shared schemas for consistency and safety.
- **Invoke route** returns 200 even when `handleCapability` returns `ok: false`; consider mapping known errors (e.g. `user_not_found`, `unknown_capability`) to 4xx/5xx.

### 1.3 Conceptual alignment

- **“Scheduling endpoint”** = any Human with schedule_* capabilities and calendar context. Patient and doctor are both such endpoints; the flow is symmetric (propose/counter/confirm between two handles). Current code already supports this; the missing piece is **triggering** that flow from the alert path (health says “schedule” → backend runs schedule flow with patient’s agent as caller, doctor’s as callee).
- **Health agent as actor**: Already the case (invoked with payload, returns decision). Standardize the output contract so the backend only needs to read `recommend_scheduling` (or `should_contact_clinic`) and optionally `urgency` / `clinic_message` to drive scheduling.
- **Main agent controls subagents**: For MVP, internal calls (same process) are fine. Main agent can be a new “chat handler” that, in a later iteration, extracts signals and calls `handleCapability` internally for health/scheduling.

---

## 2. Implementation proposal

### Phase A: Alert ingestion + health → scheduling (no chat yet)

**Goal:** iOS (or any health monitoring app) can POST an alert; backend invokes the user’s health subagent; if the health agent says “schedule appointment,” backend runs the scheduling flow with the doctor’s agent.

**A1. Schema**

- Add optional **`recommend_scheduling`** to health agent output (or formally treat `should_contact_clinic` as the contract). In shared types/schemas, document: “When true, orchestrator will attempt to schedule with a configured doctor agent.”
- Optional: add **`HealthKitEvent`** (or **`Alert`**) table: `id`, `userId` (Clerk or humanId), `type`, `payloadJson`, `createdAt`, so alerts are auditable. For v0, in-memory or log-only is acceptable.

**A2. POST /api/alerts (or /api/healthkit/events)**

- **Auth:** Clerk session or API token that maps to a user (same auth as web; iOS logs in with same identity).
- **Body:** e.g. `{ type: "HKCategoryTypeIdentifierIrregularHeartRhythmEvent", occurredAt: ISO string, ... }`. Validate with Zod.
- **Logic:**
  1. Resolve `userId` from auth.
  2. Resolve “this user’s health agent”: e.g. primary Human for that `clerkUserId` (or a dedicated health subagent identity). For v0, use the first/default Human linked to `clerkUserId` that has the health capability (or any Human for that user).
  3. Build payload for health subagent: event + optional “recent context” (v0: empty or placeholder; later: last N chat messages or summary).
  4. Call `handleCapability(healthAgentHandle, "health.anomaly_alert", payload, { traceId, provider })` (internal). Use a new trace; optionally set `trace.userId` or store in a new field for scoping.
  5. If `decision.should_contact_clinic` (or `recommend_scheduling`) is true:
     - Resolve doctor agent (v0: fixed handle e.g. `dr_smith` from env or config; later: user’s PCP or chosen doctor).
     - Run **scheduling flow**: patient’s agent (caller) ↔ doctor’s agent (callee), propose/counter/confirm. For MVP use **internal** calls: a helper `runScheduleFlow(patientHandle, doctorHandle, title, timeWindow)` that performs the multi-turn exchange (reuse logic from demo/schedule route) and returns the chosen slot / booking.
  6. Return 200 with `{ received: true, traceId, decision, schedulingAttempted?: boolean, bookingId?: string }` (or similar).

**A3. Reusable scheduling flow**

- Extract from `app/api/demo/schedule/route.ts` a **lib function** e.g. `runScheduleFlow(callerHandle: string, calleeHandle: string, title: string, durationMins: number, timeWindow: { start: string; end: string })` that:
  - Optionally starts a trace.
  - Runs propose (caller → callee) → counter (callee → caller) → confirm (caller), using `handleCapability` internally and the same calendar/booking logic.
  - Returns `{ ok, bookingId?, chosenSlot?, messages? }`.
- Demo schedule route becomes a thin wrapper that calls this helper and returns the result.
- Alert handler calls the same helper with `patientHandle` and `doctorHandle` (and title/window from config or from health decision).

**A4. Trace scoping (optional for v0)**

- Add `userId` (or `humanId`) to `Trace` so “my traces” can be filtered. When creating a trace from the alert flow, set the patient’s Clerk user id. Later, `/api/demo/trace/[traceId]` can require auth and restrict to traces owned by that user.

---

### Phase B: Chat storage + main agent (v0)

**Goal:** Store conversations; one “main” agent per user that will later extract signals and call subagents. For v0, focus on storage and a single reply path (no extraction yet).

**B1. Schema**

- **Conversation:** `id`, `clerkUserId`, `createdAt`, `updatedAt`. One conversation per user for v0 (or one per “main” agent if we add that).
- **Message:** `id`, `conversationId`, `role` (user | assistant | system), `content` (text), `createdAt`. Optional: `metadataJson` for future extraction/signals.

**B2. Chat API (minimal)**

- `GET /api/chat` or `GET /api/conversation` — list or get current user’s conversation (e.g. latest or single thread).
- `GET /api/chat/messages` — messages for that conversation (paginated or last N).
- `POST /api/chat/messages` — append a user message; optionally call main agent (LLM) to generate assistant reply; append assistant message; return new message(s). For v0 the “main agent” can be a simple LLM call with conversation history; no extraction or subagent calls yet.

**B3. Main agent identity**

- For v0, “main agent” can be implicit: the same Clerk user’s default Human (e.g. first by creation date) is the one that “owns” the conversation. No new table yet; just `Conversation.clerkUserId`. When we add extraction, that Human’s handle is used to call subagents internally.

---

### Phase C: Main agent → subagent (extraction)

**Goal:** Main agent (chat) extracts health (or other) signals and invokes the health subagent internally; health response can inform the next reply or trigger scheduling.

**C1. After each user message (or on a timer):**

- Call main agent LLM with conversation history and a prompt that asks for (1) a natural reply and (2) optional **structured signals**, e.g. `{ healthRelated?: { summary, suggestHealthSubagent?: boolean }, ... }`.
- If `suggestHealthSubagent` (or similar) is true, optionally invoke health subagent with a payload derived from the last few messages (e.g. “User reported: …”) and use the result to enrich the reply or set internal state (e.g. “consider scheduling”).
- For MVP, a simple version: if the user message contains health keywords or the LLM flags it, call `handleCapability(mainAgentHandle, "health.anomaly_alert", { user_handle, ... })` with a synthesized payload from the message; then include a short “I’ve noted this for your health context” in the reply. Full “gather context when iOS alerts” is already covered by Phase A.

**C2. Contract**

- Health subagent input: already supports `HealthAnomalyAlert` (and optional freeform_context). For chat-derived calls, pass a minimal anomaly payload plus `freeform_context` = recent message excerpt. No schema change required.

---

## 3. Suggested order of work

1. **Quick wins:** Centralize `toHex`; persist `child_calls` in Trace on finalize; add Zod validation to schedule/health capability inputs where missing.
2. **Phase A:** Implement `POST /api/alerts`, resolve user → health agent, invoke health.anomaly_alert; if `should_contact_clinic`, call reusable `runScheduleFlow(patientHandle, dr_smith, ...)`. Extract `runScheduleFlow` from demo.
3. **Phase B:** Add Conversation + Message, chat GET/POST API, simple main-agent reply (no extraction).
4. **Phase C:** Add extraction + internal health subagent call from main agent when the user message is health-relevant.

---

## 4. File/route checklist (Phase A)

| Item | Action |
|------|--------|
| `packages/shared` | Add `recommend_scheduling` to PatientDecision or document `should_contact_clinic` as the scheduling trigger. |
| `app/api/alerts/route.ts` (new) | POST: auth, parse body, resolve user → health agent, invoke health.anomaly_alert, if decision.should_contact_clinic run schedule flow, return traceId + decision + scheduling result. |
| `lib/scheduling/runScheduleFlow.ts` (new) | Extract propose/counter/confirm loop from demo; accept (callerHandle, calleeHandle, title, durationMins, timeWindow); use handleCapability internally; return booking/chosenSlot. |
| `app/api/demo/schedule/route.ts` | Refactor to call `runScheduleFlow("pari", "alex", ...)` (or from body). |
| `lib/trace.ts` | On finalize, persist `child_calls` in stepsJson or new column so getTrace from DB returns them. |
| `lib/crypto.ts` | Already exports toHex; replace local toHex in seed, ensureSeed, agents route, auth webhook with import from `@/lib/crypto`. |
| Middleware | Ensure `/api/alerts` is **protected** (not in public matcher) so only authenticated users (or app with user context) can POST. |

This keeps the existing “scheduling endpoint” and agent model intact, adds the alert → health → scheduling path, and sets up chat and main-agent orchestration for the next step.
