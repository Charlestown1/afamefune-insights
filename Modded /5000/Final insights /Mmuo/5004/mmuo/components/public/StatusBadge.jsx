const STATUS_STYLES = {
  ANALYSIS: "bg-ink-700 text-gray-200",
  SIGNAL: "bg-ink-700 text-gray-200",
  ACTIVE: "bg-blue-500/15 text-blue-300 border border-blue-500/30",
  TP1_HIT: "bg-up/15 text-up border border-up/30",
  TP2_HIT: "bg-up/15 text-up border border-up/30",
  TP3_HIT: "bg-up/15 text-up border border-up/30",
  WON: "bg-up/20 text-up border border-up/40",
  LOST: "bg-down/20 text-down border border-down/40",
  CANCELLED: "bg-ink-700 text-gray-400 border border-ink-600",
  CLOSED: "bg-ink-700 text-gray-300 border border-ink-600",
  WATCH: "bg-ink-700 text-gray-200",
  TARGET_HIT: "bg-up/15 text-up border border-up/30",
  INVALIDATED: "bg-down/15 text-down border border-down/30"
};

const STATUS_LABELS = {
  TP1_HIT: "TP1 HIT",
  TP2_HIT: "TP2 HIT",
  TP3_HIT: "TP3 HIT",
  TARGET_HIT: "TARGET HIT"
};

export default function StatusBadge({ status }) {
  const style = STATUS_STYLES[status] || "bg-ink-700 text-gray-200";
  const label = STATUS_LABELS[status] || status?.replace(/_/g, " ");

  return (
    <span className={`inline-block rounded px-2.5 py-1 text-xs font-bold tracking-wide ${style}`}>
      {label}
    </span>
  );
}
