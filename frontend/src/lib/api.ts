// AgentMesh API client

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

import type {
  AgentRecord,
  AgentRegistration,
  AgentSearchResult,
  OrchestrationResponse,
} from "./types";

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function listAgents(): Promise<AgentRecord[]> {
  return apiFetch<AgentRecord[]>("/agents/list");
}

export async function registerAgent(
  agent: AgentRegistration
): Promise<AgentRecord> {
  return apiFetch<AgentRecord>("/agents/register", {
    method: "POST",
    body: JSON.stringify(agent),
  });
}

export async function searchAgents(
  query: string,
  topK = 5
): Promise<AgentSearchResult[]> {
  return apiFetch<AgentSearchResult[]>("/agents/search", {
    method: "POST",
    body: JSON.stringify({ query, top_k: topK }),
  });
}

export async function orchestrate(
  userGoal: string,
  context?: Record<string, unknown>
): Promise<OrchestrationResponse> {
  return apiFetch<OrchestrationResponse>("/orchestrate", {
    method: "POST",
    body: JSON.stringify({ user_goal: userGoal, context }),
  });
}

export async function healthCheck(): Promise<{
  status: string;
  agents_count: number;
}> {
  return apiFetch("/health");
}
