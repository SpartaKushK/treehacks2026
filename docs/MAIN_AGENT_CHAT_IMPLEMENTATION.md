# Main agent chat – suggested implementation

Concrete, file-level implementation for the main agent chat: **Phase B** (storage + simple reply) and **Phase C** (optional extraction → health subagent).

---

## Phase B: Chat storage + main agent (v0)

### B1. Data model

**Prisma** (`apps/web/prisma/schema.prisma`):

```prisma
model Conversation {
  id          String   @id @default(uuid())
  clerkUserId String   @unique   // one conversation per user for v0
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  messages    Message[]
}

model Message {
  id             String   @id @default(uuid())
  conversationId String
  role           String   // "user" | "assistant" | "system"
  content        String
  metadataJson   String?  // optional; for future extraction/signals
  createdAt      DateTime @default(now())
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
}
```

After adding: `pnpm --filter web db:push` (or create a migration).

---

### B2. Chat API

| Route | Method | Auth | Behavior |
|-------|--------|------|----------|
| `app/api/chat/route.ts` | GET | Clerk | Get current user's single conversation (create if missing). Return `{ conversation: { id, clerkUserId, createdAt, updatedAt } }`. |
| `app/api/chat/messages/route.ts` | GET | Clerk | Query `?limit=50&before=<messageId>` (optional). Load conversation by clerkUserId, return messages ordered by createdAt desc, then slice. Return `{ messages: Message[] }`. |
| `app/api/chat/messages/route.ts` | POST | Clerk | Body: `{ content: string }`. Validate with Zod. Get-or-create conversation. Insert user message. Call main-agent reply (B3). Insert assistant message. Return `{ userMessage, assistantMessage }`. |

- **Resolve conversation:** `prisma.conversation.findUnique({ where: { clerkUserId } })`; if null, `prisma.conversation.create({ data: { clerkUserId } })`.
- **Middleware:** Do **not** add `/api/chat` to the public matcher so these routes stay protected.

---

### B3. Main agent reply (no extraction)

**New file:** `lib/chat/mainAgentReply.ts`

- **Signature:** `mainAgentReply(messages: { role: string; content: string }[], provider: "openai" | "claude"): Promise<string>`.
- **Behavior:**
  - Build `messages` for the LLM: optional system message (e.g. "You are the user's personal assistant. Be helpful and concise.") + last N messages (e.g. 20) in chronological order. Each item `{ role: "user" | "assistant" | "system", content: string }`.
  - **OpenAI:** `POST https://api.openai.com/v1/chat/completions` with `model: "gpt-4o-mini"`, `messages`, `max_tokens: 1024`. Parse `choices[0].message.content`.
  - **Claude:** Use Anthropic Messages API with the same message list; parse the first text block from the response.
  - If no API key for the chosen provider, return a fallback string (e.g. "I'm not configured to reply right now. Please set OPENAI_API_KEY or ANTHROPIC_API_KEY.").
  - Return the assistant reply text only (no structured extraction yet).

**Where to get `provider`:** From the current user's "main" agent: `prisma.human.findFirst({ where: { clerkUserId }, orderBy: { createdAt: "asc" } })` and use `human.llmProvider` (default `"claude"`). If the user has no Human yet, use env default or `"claude"`.

---

### B4. POST /api/chat/messages flow

1. `auth()` → get `userId`; if missing return 401.
2. Parse body `{ content: string }` (Zod: non-empty string).
3. Get or create conversation for `userId`.
4. Append message with `role: "user"`, `content: body.content`.
5. Load last N messages (e.g. 30) for this conversation (including the one just added), ordered by `createdAt` asc.
6. Resolve main agent (user's first Human) and `provider = human.llmProvider ?? "claude"`.
7. `reply = await mainAgentReply(messagesForLlm, provider)`.
8. Append message with `role: "assistant"`, `content: reply`.
9. Return `{ userMessage: { id, role, content, createdAt }, assistantMessage: { id, role, content, createdAt } }`.

---

### B5. Chat UI

- **Page:** `app/dashboard/chat/page.tsx`.
- **Behavior:**
  - On load: `GET /api/chat` then `GET /api/chat/messages` to populate the thread.
  - Render a list of messages (user right, assistant left or a simple stacked list).
  - Input at bottom: on submit, `POST /api/chat/messages` with `{ content }`, then append the returned `userMessage` and `assistantMessage` to local state (or refetch messages).
- Add a "Chat" item to the dashboard sidebar linking to `/dashboard/chat`.

---

### B6. File checklist (Phase B)

| Item | Action |
|------|--------|
| `prisma/schema.prisma` | Add `Conversation` and `Message` models as above. |
| `app/api/chat/route.ts` | GET: auth → get-or-create conversation for clerkUserId → return conversation. |
| `app/api/chat/messages/route.ts` | GET: auth → conversation → messages (paginated by limit/before). POST: auth → parse body → get-or-create conversation → insert user message → mainAgentReply → insert assistant message → return both messages. |
| `lib/chat/mainAgentReply.ts` | New: `mainAgentReply(messages, provider)` calling OpenAI or Anthropic chat API; return assistant text. |
| `app/dashboard/chat/page.tsx` | New: load conversation + messages; render thread; input that POSTs and appends user + assistant messages. |
| `components/Sidebar.tsx` | Add "Chat" nav item linking to `/dashboard/chat`. |
| Middleware | Leave `/api/chat` **out** of the public matcher so chat routes stay protected. |

---

## Phase C: Extraction + health subagent (optional follow-on)

- **Structured reply (optional):** Extend `mainAgentReply` (or add a second LLM call) so the model returns both:
  - A **natural reply** (shown to the user), and
  - **Structured signals** (e.g. JSON): `{ healthRelated?: { summary: string, suggestHealthSubagent?: boolean } }`. Use a system prompt that asks for this format; parse the assistant message or a separate tool/JSON block.
- **When `suggestHealthSubagent` is true (or a simple keyword heuristic for v0):**
  - Resolve the user's main agent handle (same Human as above).
  - Build a minimal `HealthAnomalyAlert`-shaped payload: e.g. `user_handle: mainAgentHandle`, `freeform_context: "<last 1–3 user messages>"`, and minimal required fields (date, baseline_window_days, metrics/baseline/flags/anomaly_score with defaults or placeholders).
  - Call `handleCapability(mainAgentHandle, "health.anomaly_alert", payload, { traceId, provider })` **internally** (no signed invoke).
  - Optionally append a short system or assistant line: "I've noted this for your health context," or fold the health decision into the natural reply.
- **Contract:** Health subagent already accepts `freeform_context`; no schema change. For chat-derived calls, the important part is `freeform_context`; other fields can be minimal for "context only" usage.

This gives you a single, stored conversation per user and a main-agent reply path. Phase C can be added later by extending the POST handler or `mainAgentReply` to parse signals and call `handleCapability(..., "health.anomaly_alert", ...)` when appropriate.
