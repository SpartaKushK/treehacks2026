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
    <Link href={`/dashboard/agents/${handle}`} className="agent-card" style={{ padding: "1.5rem", minHeight: "140px" }}>
      <div className="agent-card-header" style={{ marginBottom: "1rem" }}>
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={displayName}
            style={{
              width: 56, height: 56, borderRadius: 12,
              objectFit: "cover", border: "2px solid #F5EDE3",
              flexShrink: 0,
            }}
          />
        ) : (
          <div className="agent-avatar" style={{ width: 56, height: 56, borderRadius: 12, fontSize: "1.5rem" }}>{displayName[0].toUpperCase()}</div>
        )}
        <div>
          <div className="agent-card-name" style={{ fontSize: "1.25rem", marginBottom: "0.25rem" }}>{displayName}</div>
          <div className="agent-card-handle" style={{ fontSize: "0.875rem" }}>@{handle}</div>
        </div>
      </div>
      <div className="agent-card-meta" style={{ gap: "0.5rem" }}>
        <span className="badge badge-blue" style={{ fontSize: "0.8rem", padding: "0.375rem 0.75rem" }}>{capabilityCount} capabilities</span>
        <span className="badge badge-purple" style={{ fontSize: "0.8rem", padding: "0.375rem 0.75rem" }}>{llmProvider}</span>
      </div>
    </Link>
  );
}
