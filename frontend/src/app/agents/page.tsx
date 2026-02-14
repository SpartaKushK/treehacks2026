"use client";

import { useEffect, useState } from "react";
import { listAgents, registerAgent } from "@/lib/api";
import type { AgentRecord, AgentRegistration } from "@/lib/types";

function AgentCard({ agent }: { agent: AgentRecord }) {
  return (
    <div className="border border-gray-800 rounded-lg p-4 bg-gray-900/50 hover:border-gray-700 transition-colors">
      <div className="flex items-start justify-between mb-2">
        <h3 className="font-semibold text-white">{agent.name}</h3>
        <span className="text-xs px-2 py-0.5 rounded-full bg-green-900/50 text-green-400 border border-green-800">
          {agent.cost}
        </span>
      </div>
      <p className="text-sm text-gray-400 mb-3 line-clamp-2">
        {agent.description}
      </p>
      <div className="flex flex-wrap gap-1 mb-3">
        {agent.tags.map((tag) => (
          <span
            key={tag}
            className="text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-400"
          >
            {tag}
          </span>
        ))}
      </div>
      <div className="text-xs text-gray-500 space-y-1">
        <div className="truncate">
          Endpoint: <span className="text-gray-400">{agent.endpoint}</span>
        </div>
        <div>
          Input:{" "}
          <span className="text-gray-400">
            {Object.keys(agent.input_schema).join(", ")}
          </span>
        </div>
        <div>
          Output:{" "}
          <span className="text-gray-400">
            {Object.keys(agent.output_schema).join(", ")}
          </span>
        </div>
      </div>
    </div>
  );
}

function RegisterModal({
  onClose,
  onRegistered,
}: {
  onClose: () => void;
  onRegistered: (agent: AgentRecord) => void;
}) {
  const [form, setForm] = useState<AgentRegistration>({
    name: "",
    description: "",
    tags: [],
    input_schema: {},
    output_schema: {},
    endpoint: "",
    cost: "free",
  });
  const [tagsInput, setTagsInput] = useState("");
  const [inputSchemaStr, setInputSchemaStr] = useState("{}");
  const [outputSchemaStr, setOutputSchemaStr] = useState("{}");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const registration: AgentRegistration = {
        ...form,
        tags: tagsInput
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        input_schema: JSON.parse(inputSchemaStr),
        output_schema: JSON.parse(outputSchemaStr),
      };
      const result = await registerAgent(registration);
      onRegistered(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Register New Agent</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Name</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. PricingAgent"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Description
            </label>
            <textarea
              required
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              placeholder="Describe what this agent does..."
              rows={2}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Tags (comma-separated)
            </label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="pricing, landing-page, tiers"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Endpoint URL
            </label>
            <input
              type="text"
              required
              value={form.endpoint}
              onChange={(e) => setForm({ ...form, endpoint: e.target.value })}
              placeholder="http://localhost:8005/run"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Input Schema (JSON)
            </label>
            <textarea
              value={inputSchemaStr}
              onChange={(e) => setInputSchemaStr(e.target.value)}
              rows={2}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Output Schema (JSON)
            </label>
            <textarea
              value={outputSchemaStr}
              onChange={(e) => setOutputSchemaStr(e.target.value)}
              rows={2}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {error && (
            <div className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg p-3">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {submitting ? "Registering..." : "Register Agent"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRegister, setShowRegister] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAgents = async () => {
    try {
      const result = await listAgents();
      setAgents(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load agents");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgents();
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Agent Registry</h1>
          <p className="text-sm text-gray-400 mt-1">
            {agents.length} agent{agents.length !== 1 ? "s" : ""} registered
          </p>
        </div>
        <button
          onClick={() => setShowRegister(true)}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          Register Agent
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-900/30 border border-red-800 rounded-lg text-sm text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading agents...</div>
      ) : agents.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">No agents registered yet</p>
          <button
            onClick={() => setShowRegister(true)}
            className="text-indigo-400 hover:text-indigo-300 text-sm"
          >
            Register your first agent
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}

      {showRegister && (
        <RegisterModal
          onClose={() => setShowRegister(false)}
          onRegistered={(agent) => {
            setAgents((prev) => [agent, ...prev]);
            setShowRegister(false);
          }}
        />
      )}
    </div>
  );
}
