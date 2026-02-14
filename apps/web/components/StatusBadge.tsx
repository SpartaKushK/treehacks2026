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

export default function StatusBadge({ status, label }: Props) {
  return (
    <span className={`badge ${CLASS_MAP[status] || "badge-blue"}`}>
      {label || status.toUpperCase()}
    </span>
  );
}
