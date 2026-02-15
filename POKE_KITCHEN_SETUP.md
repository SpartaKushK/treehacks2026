# CareSync - Poke Kitchen Configuration Guide

## Your MCP Server Details
- **Tunnel URL**: `https://tunnel.poke.com/9c6c02a5-e81d-4885-9664-7408066911c6/mcp`
- **Recipe Name**: CareSync
- **Server Name**: caresync-health

---

## Kitchen Setup Instructions

### 1. Create Your Recipe
1. Go to [poke.com/kitchen](https://poke.com/kitchen)
2. Click **"Create recipe"**
3. Follow these settings:

---

### 2. BASICS Configuration

**Recipe Name**: `CareSync - Your AI Health Secretary`

**Description** (optional but recommended):
```
Never miss a health warning. Your AI monitors your health 24/7 and automatically coordinates care when something's wrong.
```

---

### 3. ONBOARDING Configuration

#### **Input Context** (`inputContext`):
```
I'm your AI health secretary. I'll help you:
• Monitor your health metrics 24/7
• Detect concerning patterns before they become emergencies
• Automatically schedule appointments when needed
• Explain what's happening with your health in clear terms

To get started, I need to understand your health monitoring needs.

What brings you to CareSync?
1️⃣ I have a chronic condition I'm managing
2️⃣ I want to monitor my overall health
3️⃣ I'm tracking recovery from illness/injury
4️⃣ Just exploring (demo mode)

Reply with a number or describe your situation.
```

#### **Prefilled First Message** (`prefilledFirstText`):
```
Show me my health summary for the last 30 days
```

**Alternative options to suggest:**
- "Show me my health summary for the last 30 days"
- "Are there any concerning patterns in my recent data?"
- "Run a health check on my wearable data"
- "Schedule a checkup with my doctor"

---

### 4. INTEGRATIONS Configuration

Select these integrations:

✅ **Your MCP Server**: `caresync-health`
- This is your tunnel URL: `https://tunnel.poke.com/9c6c02a5-e81d-4885-9664-7408066911c6/mcp`
- Mark as: "Share with users (no setup required)" ← IMPORTANT for easy onboarding

Optional (if you want to expand):
- **Google Calendar** - for appointment scheduling
- **Apple Health** - for health data (if Poke supports)
- **Google Fit** - for health data (if Poke supports)

---

### 5. AUTOMATIONS Configuration

Add these scheduled automations:

#### **Automation 1: Daily Health Check**
- **Schedule**: Every day at 10:00 PM
- **Cron**: `0 22 * * *`
- **Action Description**:
```
Run anomaly detection on today's health metrics. If anomaly score > 85, immediately analyze and triage. If moderate concern (score 55-85), log for review. Text me if action is needed.
```

#### **Automation 2: Weekly Health Summary**
- **Schedule**: Every Sunday at 9:00 AM
- **Cron**: `0 9 * * 0`
- **Action Description**:
```
Generate and send a comprehensive 7-day health summary including sleep trends, activity patterns, and any concerning changes. Include AI-generated patient-friendly explanation.
```

#### **Automation 3: Appointment Reminder Check**
- **Schedule**: Every day at 8:00 AM
- **Cron**: `0 8 * * *`
- **Action Description**:
```
Check for any scheduled appointments in the next 24 hours and send reminder with appointment details.
```

---

### 6. TEST in Sandbox

Before publishing:
1. Click **"Test in Sandbox"**
2. Try these commands:
   - "Show me my health summary"
   - "Analyze my health data for anomalies"
   - "Run a severe health trigger"
3. Verify tools are working correctly
4. Check that automations fire properly

---

### 7. PUBLISH Your Recipe

⚠️ **IMPORTANT**: Publishing is permanent and locks editing!

Once you're confident:
1. Click **"Publish Recipe"**
2. Get your shareable link (looks like: `poke.com/r/caresync-your-id`)
3. Share everywhere to get $1 per signup!

---

## Your Tools Available to Users

Once published, users can invoke:

1. **get_health_summary** - 30-day health overview
2. **analyze_anomaly** - Run full anomaly detection pipeline
3. **run_health_trigger** - Full Secretary Agent with AI function-calling
4. **schedule_appointment** - Multi-agent calendar scheduling
5. **get_trace** - View execution traces for transparency

---

## Promotional Materials

Use these when sharing your Recipe:

### Short Description:
"CareSync: AI health secretary that monitors your wearables 24/7, detects problems early, and automatically schedules care. Like having a doctor watching over you."

### Key Benefits:
✓ Catches health issues before you feel symptoms
✓ Actually takes action (schedules appointments, triages cases)
✓ Works while you sleep
✓ Full transparency with execution traces

### Target Users:
- Chronic disease patients (diabetes, heart disease, hypertension)
- Caregivers monitoring elderly relatives
- Athletes tracking recovery
- Anyone wanting proactive health monitoring

---

## Troubleshooting

**If tools don't work:**
- Make sure your Poke tunnel is still running (check terminal)
- Verify Next.js app is running on port 3000
- Check MCP server is running on port 8787
- Restart tunnel if needed: `npx poke@latest tunnel http://localhost:8787/mcp --name CareSync`

**To restart everything:**
```bash
# Terminal 1: Next.js
pnpm dev

# Terminal 2: MCP Server
pnpm mcp:dev

# Terminal 3: Poke Tunnel
npx poke@latest tunnel http://localhost:8787/mcp --name CareSync
```
