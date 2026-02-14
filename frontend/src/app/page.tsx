"use client";

import { useState } from "react";
import { orchestrate } from "@/lib/api";
import type { OrchestrationResponse, StepResult } from "@/lib/types";

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-gray-700 text-gray-300",
    running: "bg-yellow-900 text-yellow-300 animate-pulse-dot",
    success: "bg-green-900 text-green-300",
    failed: "bg-red-900 text-red-300",
    skipped: "bg-gray-700 text-gray-400",
  };
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[status] || styles.pending}`}
    >
      {status}
    </span>
  );
}

function StepCard({
  step,
  result,
}: {
  step: { id: string; agent_query: string; success_criteria: string };
  result?: StepResult;
}) {
  const [expanded, setExpanded] = useState(false);
  const status = result?.status || "pending";

  return (
    <div className="border border-gray-800 rounded-lg p-4 bg-gray-900/50">
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <StatusBadge status={status} />
            <span className="text-sm font-medium truncate">{step.id}</span>
          </div>
          <p className="text-sm text-gray-400 truncate">{step.agent_query}</p>
        </div>
        <div className="flex items-center gap-3 ml-4 shrink-0">
          {result?.agent_name && (
            <span className="text-xs px-2 py-1 rounded bg-indigo-900/50 text-indigo-300 border border-indigo-800">
              {result.agent_name}
            </span>
          )}
          {result?.duration_ms !== undefined && result.duration_ms > 0 && (
            <span className="text-xs text-gray-500">
              {(result.duration_ms / 1000).toFixed(1)}s
            </span>
          )}
          <svg
            className={`w-4 h-4 text-gray-500 transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </div>

      {expanded && result && (
        <div className="mt-3 pt-3 border-t border-gray-800">
          {result.error && (
            <div className="text-sm text-red-400 mb-2">Error: {result.error}</div>
          )}
          {result.output && (
            <pre className="text-xs text-gray-300 bg-gray-950 rounded p-3 overflow-auto max-h-64">
              {JSON.stringify(result.output, null, 2)}
            </pre>
          )}
          {result.retries > 0 && (
            <p className="text-xs text-yellow-500 mt-2">
              Retries: {result.retries}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const [goal, setGoal] = useState("");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<OrchestrationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goal.trim() || loading) return;

    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const result = await orchestrate(goal.trim());
      setResponse(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Orchestration failed");
    } finally {
      setLoading(false);
    }
  };

  const statusStyles: Record<string, string> = {
    completed: "text-green-400",
    partial: "text-yellow-400",
    failed: "text-red-400",
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">
          <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
            AgentMesh
          </span>{" "}
          Orchestrator
        </h1>
        <p className="text-gray-400">
          Describe your goal and watch agents collaborate automatically
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mb-8">
        <div className="flex gap-3">
          <input
            type="text"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder='e.g. "Create a landing page for AcmeCo, research 3 competitors, and draft 2 outbound emails"'
            className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !goal.trim()}
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg
                  className="animate-spin w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Running...
              </span>
            ) : (
              "Orchestrate"
            )}
          </button>
        </div>
      </form>

      {error && (
        <div className="mb-6 p-4 bg-red-900/30 border border-red-800 rounded-lg text-sm text-red-300">
          {error}
        </div>
      )}

      {loading && !response && (
        <div className="text-center py-12">
          <div className="inline-flex items-center gap-3 text-gray-400">
            <svg
              className="animate-spin w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Planning and executing workflow...
          </div>
        </div>
      )}

      {response && (
        <div className="space-y-6">
          {/* Status header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Execution Results</h2>
              <p className="text-sm text-gray-400 mt-1">
                Goal: {response.goal}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`text-sm font-medium ${statusStyles[response.status] || "text-gray-400"}`}
              >
                {response.status.toUpperCase()}
              </span>
              <span className="text-xs text-gray-500">
                {response.results.filter((r) => r.status === "success").length}/
                {response.results.length} steps
              </span>
            </div>
          </div>

          {/* Steps */}
          <div className="space-y-3">
            {response.plan.steps.map((step, i) => (
              <StepCard
                key={step.id}
                step={step}
                result={response.results[i]}
              />
            ))}
          </div>

          {/* Artifacts summary */}
          {Object.keys(response.artifacts).length > 0 && (
            <div className="border border-gray-800 rounded-lg p-4 bg-gray-900/30">
              <h3 className="text-sm font-semibold mb-3 text-gray-300">
                Artifacts
              </h3>
              <div className="space-y-2">
                {Object.entries(response.artifacts).map(([stepId, data]) => {
                  const artifact = data as Record<string, unknown>;
                  if (artifact.preview_url) {
                    return (
                      <div key={stepId} className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">{stepId}:</span>
                        <a
                          href={artifact.preview_url as string}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-indigo-400 hover:text-indigo-300 underline"
                        >
                          {artifact.preview_url as string}
                        </a>
                      </div>
                    );
                  }
                  return (
                    <div key={stepId} className="text-xs text-gray-500">
                      {stepId}: {Object.keys(artifact).join(", ")}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Example prompts */}
      {!response && !loading && (
        <div className="mt-8">
          <p className="text-sm text-gray-500 mb-3">Try these examples:</p>
          <div className="space-y-2">
            {[
              "Create a landing page for AcmeCo, an AI analytics startup. Research 3 competitors, generate copy, deploy the page, and draft 2 outbound emails.",
              "Research the top 3 competitors in the AI code review space and summarize findings.",
              "Generate landing page copy for CloudSync, a cloud backup tool, and deploy it.",
            ].map((example) => (
              <button
                key={example}
                onClick={() => setGoal(example)}
                className="block w-full text-left text-sm text-gray-400 hover:text-white bg-gray-900/50 hover:bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 transition-colors"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
