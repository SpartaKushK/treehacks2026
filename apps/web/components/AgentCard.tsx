"use client";

import Link from "next/link";

interface Props {
  handle: string;
  displayName: string;
  capabilityCount: number;
  llmProvider: string;
  avatarUrl?: string | null;
}

export default function AgentCard({ handle, displayName, capabilityCount, llmProvider, avatarUrl }: Props) {
  return (
    <Link href={`/dashboard/agents/${handle}`} className="agent-card">
      <div className="agent-card-header">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={displayName}
            style={{
              width: 48, height: 48, borderRadius: 14,
              objectFit: "cover", border: "2px solid #F5EDE3",
              flexShrink: 0,
            }}
          />
        ) : (
          <div className="agent-avatar">{displayName[0].toUpperCase()}</div>
        )}
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
