interface Props {
  status: "active" | "resolved" | "dismissed" | "urgent" | "soon" | "routine";
  label?: string;
}

const CLASS_MAP: Record<string, string> = {
  active: "badge-yellow",
  resolved: "badge-green",
  dismissed: "badge-blue",
  urgent: "badge-red",
  soon: "badge-yellow",
  routine: "badge-green",
};

// Add icon map for non-color identification (accessibility)
const ICON_MAP: Record<string, string> = {
  active: "⚠",
  resolved: "✓",
  dismissed: "−",
  urgent: "!",
  soon: "○",
  routine: "✓",
};

export default function StatusBadge({ status, label }: Props) {
  return (
    <span
      className={`badge ${CLASS_MAP[status] || "badge-blue"}`}
      style={{
        fontSize: "0.8125rem",      // Explicit override for accessibility
        fontWeight: 700,
        lineHeight: "1.4",
        display: "inline-flex",
        alignItems: "center",
        gap: "0.25rem",
      }}
    >
      <span aria-hidden="true">{ICON_MAP[status]}</span>
      {label || status.toUpperCase()}
    </span>
  );
}
