// AgentMesh TypeScript types — mirrors backend Pydantic models

export interface AgentRecord {
  id: string;
  name: string;
  description: string;
  tags: string[];
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
  endpoint: string;
  auth?: string | null;
  cost: string;
  created_at?: string;
  is_active?: boolean;
}

export interface AgentRegistration {
  name: string;
  description: string;
  tags: string[];
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
  endpoint: string;
  auth?: string;
  cost?: string;
}

export interface AgentSearchResult {
  agent: AgentRecord;
  score: number;
}

export interface PlanStep {
  id: string;
  agent_query: string;
  input: Record<string, unknown>;
  success_criteria: string;
  on_fail: string;
  depends_on: string[];
}

export interface ExecutionPlan {
  goal: string;
  steps: PlanStep[];
}

export type StepStatus = "pending" | "running" | "success" | "failed" | "skipped";

export interface StepResult {
  step_id: string;
  status: StepStatus;
  agent_id?: string | null;
  agent_name?: string | null;
  output?: Record<string, unknown> | null;
  error?: string | null;
  duration_ms: number;
  retries: number;
}

export interface OrchestrationResponse {
  trace_id: string;
  goal: string;
  plan: ExecutionPlan;
  results: StepResult[];
  status: "completed" | "partial" | "failed";
  artifacts: Record<string, unknown>;
  created_at: string;
}
