"use client";

import Link from "next/link";

interface Props {
  handle: string;
  displayName: string;
  capabilityCount: number;
  llmProvider: string;
}

export default function AgentCard({ handle, displayName, capabilityCount, llmProvider }: Props) {
  return (
    <Link href={`/dashboard/agents/${handle}`} className="agent-card">
      <div className="agent-card-header">
        <div className="agent-avatar">{displayName[0].toUpperCase()}</div>
        <div>
          <div className="agent-card-name">{displayName}</div>
          <div className="agent-card-handle">@{handle}</div>
        </div>
      </div>
      <div className="agent-card-meta">
        <span className="badge badge-blue">{capabilityCount} capabilities</span>
        <span className="badge badge-purple">{llmProvider}</span>
      </div>
    </Link>
  );
}
