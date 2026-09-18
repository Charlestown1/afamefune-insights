export default function DirectionBadge({ direction }) {
  const isBuy = direction === "BUY";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-bold tracking-wide ${
        isBuy ? "bg-up/15 text-up" : "bg-down/15 text-down"
      }`}
    >
      {isBuy ? "▲" : "▼"} {direction}
    </span>
  );
}
