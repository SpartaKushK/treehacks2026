-- Supabase SQL schema for TreeHacks
-- Run this in the Supabase SQL Editor to create all tables

-- Core agent/user table
CREATE TABLE IF NOT EXISTS humans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  handle TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  public_key TEXT NOT NULL,
  endpoint_url TEXT NOT NULL,
  clerk_user_id TEXT,
  persona_prompt TEXT,
  llm_provider TEXT NOT NULL DEFAULT 'claude',
  anomaly_threshold_json TEXT NOT NULL DEFAULT '{"urgent":85,"soon":70}',
  heygen_avatar_id TEXT,
  avatar_photo_url TEXT,
  google_calendar_tokens TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Agent capabilities
CREATE TABLE IF NOT EXISTS capabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  human_id UUID NOT NULL REFERENCES humans(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  input_schema_json TEXT NOT NULL DEFAULT '{}',
  output_schema_json TEXT NOT NULL DEFAULT '{}'
);

-- Access control policies
CREATE TABLE IF NOT EXISTS policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  human_id UUID NOT NULL REFERENCES humans(id) ON DELETE CASCADE,
  capability_name TEXT NOT NULL,
  allowed_callers_json TEXT NOT NULL DEFAULT '["*"]',
  required_scopes_json TEXT NOT NULL DEFAULT '[]',
  payment_required BOOLEAN NOT NULL DEFAULT false,
  price_cents INTEGER NOT NULL DEFAULT 0
);

-- Calendar events
CREATE TABLE IF NOT EXISTS calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  human_id UUID NOT NULL REFERENCES humans(id) ON DELETE CASCADE,
  start_ts TEXT NOT NULL,
  end_ts TEXT NOT NULL,
  title TEXT NOT NULL,
  google_event_id TEXT,
  source TEXT NOT NULL DEFAULT 'local'
);

-- Health metrics
CREATE TABLE IF NOT EXISTS health_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  human_id UUID NOT NULL REFERENCES humans(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  sleep_hours DOUBLE PRECISION NOT NULL,
  steps INTEGER NOT NULL,
  med_adherence BOOLEAN NOT NULL,
  symptom_score DOUBLE PRECISION NOT NULL
);

-- Bookings
CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_handle TEXT NOT NULL,
  to_handle TEXT NOT NULL,
  start_ts TEXT NOT NULL,
  end_ts TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Execution traces
CREATE TABLE IF NOT EXISTS traces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  provider TEXT NOT NULL,
  steps_json TEXT NOT NULL DEFAULT '[]'
);

-- Anomaly alerts
CREATE TABLE IF NOT EXISTS anomaly_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  human_id UUID NOT NULL REFERENCES humans(id) ON DELETE CASCADE,
  trace_id TEXT,
  severity TEXT NOT NULL,
  anomaly_score INTEGER NOT NULL,
  flags_json TEXT NOT NULL DEFAULT '[]',
  decision_json TEXT NOT NULL DEFAULT '{}',
  triage_outcome_json TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_humans_handle ON humans(handle);
CREATE INDEX IF NOT EXISTS idx_humans_clerk_user_id ON humans(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_capabilities_human_id ON capabilities(human_id);
CREATE INDEX IF NOT EXISTS idx_policies_human_id ON policies(human_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_human_id ON calendar_events(human_id);
CREATE INDEX IF NOT EXISTS idx_health_metrics_human_id ON health_metrics(human_id);
CREATE INDEX IF NOT EXISTS idx_anomaly_alerts_human_id ON anomaly_alerts(human_id);
CREATE INDEX IF NOT EXISTS idx_anomaly_alerts_status ON anomaly_alerts(status);
