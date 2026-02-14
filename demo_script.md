# AgentMesh — 2-Minute Demo Script

## Setup (before demo)
- Backend running on :8000
- 5 agents registered (Research, Copy, Deploy, Outreach, Summary)
- PricingAgent server running on :8005 but NOT registered
- Frontend on :3000

---

## Demo Flow (2 min)

### [0:00-0:15] Hook
> "What if you could add a new AI agent to your system and it just... works? No integration code. No orchestrator changes. It discovers itself."
> "This is AgentMesh — plug-and-play agent interoperability."

### [0:15-0:30] Show the Agent Registry
- Navigate to **localhost:3000/agents**
- Show 5 registered agents: Research, Copy, Deploy, Outreach, Summary
- Point out: each has a name, description, tags, and endpoint
- "These agents registered themselves. The system knows what they can do."

### [0:30-1:00] First Orchestration Run
- Navigate to **localhost:3000** (main chat UI)
- Type: **"Create a landing page for AcmeCo, an AI analytics startup. Research 3 competitors, generate copy, deploy it, and draft 2 outbound emails."**
- Click **Orchestrate**
- While it runs, narrate:
  > "GPT-4o decomposes this into steps. For each step, it searches the registry by capability — not by name. It finds the best agent, calls it, and chains the outputs."
- When complete, expand each step:
  - **Research:** show competitor findings
  - **Copy:** show generated headline + features
  - **Deploy:** click the preview URL to show the live landing page
  - **Emails:** show drafted outbound emails
- "4 agents, 1 prompt, fully automatic."

### [1:00-1:30] The Wow Moment — Live Plug-in
- Navigate to **localhost:3000/agents**
- Click **Register Agent**
- Fill in:
  - Name: `PricingAgent`
  - Description: `Generates product pricing page sections with tier comparison tables`
  - Tags: `pricing, landing-page, tiers`
  - Endpoint: `http://localhost:8005/run`
  - Input Schema: `{"product_name": "string", "tiers": "array"}`
  - Output Schema: `{"pricing_html": "string", "tiers_data": "array"}`
- Click **Register**
- "We just added a new agent. Zero code changes. Let's see what happens."

### [1:30-1:55] Second Run — PricingAgent Auto-Discovered
- Go back to chat, enter: **"Create a landing page for AcmeCo with pricing tiers, research competitors, and draft outreach emails."**
- Click **Orchestrate**
- Show: the plan now has a **pricing step** that wasn't there before!
- "The orchestrator searched for 'generate pricing tiers' and found our new PricingAgent. No hardcoding. Pure discovery."
- Expand the pricing step to show the generated pricing section.

### [1:55-2:00] Close
> "This is AgentMesh. Register. Discover. Orchestrate. Plug and play."

---

## Talking Points for Q&A
- **How does discovery work?** OpenAI embeddings + FAISS cosine similarity search
- **What if an agent fails?** Retry → try next-best agent → ask user for clarification
- **Open model?** SummaryAgent uses llama3.2 via Ollama — same POST /run interface
- **Modal?** Sandbox runner executes untrusted Python in isolated Modal containers
- **Scale?** Agent protocol is just HTTP — agents can be microservices, serverless functions, or external APIs
