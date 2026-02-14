"use client";

interface Props {
  value: "openai" | "claude";
  onChange: (v: "openai" | "claude") => void;
}

export default function ProviderToggle({ value, onChange }: Props) {
  return (
    <div style={{ display: "flex", gap: 0, borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)" }}>
      <button
        className={value === "openai" ? "toggle-active" : "toggle-inactive"}
        onClick={() => onChange("openai")}
        style={{
          padding: "0.375rem 0.875rem",
          fontSize: "0.8rem",
          fontWeight: 600,
          fontFamily: "inherit",
          cursor: "pointer",
          border: "none",
          background: value === "openai" ? "var(--accent)" : "var(--bg-card)",
          color: value === "openai" ? "white" : "var(--text-dim)",
          transition: "all 0.15s",
        }}
      >
        OpenAI
      </button>
      <button
        onClick={() => onChange("claude")}
        style={{
          padding: "0.375rem 0.875rem",
          fontSize: "0.8rem",
          fontWeight: 600,
          fontFamily: "inherit",
          cursor: "pointer",
          border: "none",
          borderLeft: "1px solid var(--border)",
          background: value === "claude" ? "var(--accent)" : "var(--bg-card)",
          color: value === "claude" ? "white" : "var(--text-dim)",
          transition: "all 0.15s",
        }}
      >
        Claude
      </button>
    </div>
  );
}
