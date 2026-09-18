import Link from "next/link";
import StatusBadge from "./StatusBadge";
import DirectionBadge from "./DirectionBadge";

export default function ForexCard({ item }) {
  return (
    <Link href={`/forex/${item._id}`} className="card block p-5 transition hover:border-gold-500/50">
      <div className="mb-3 flex items-center justify-between">
        <div className="font-display text-lg font-bold text-gray-50">{item.pair}</div>
        <DirectionBadge direction={item.direction} />
      </div>

      <h3 className="mb-3 line-clamp-2 text-sm font-medium text-gray-200">{item.title}</h3>

      <div className="mb-3 grid grid-cols-3 gap-2 text-xs text-gray-400">
        <div>
          <div className="text-[10px] uppercase text-gray-500">Entry</div>
          <div className="text-gray-200">{item.entry || "—"}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-gray-500">SL</div>
          <div className="text-down">{item.stopLoss || "—"}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-gray-500">TP1</div>
          <div className="text-up">{item.takeProfit1 || "—"}</div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <StatusBadge status={item.status} />
        <span className="text-xs text-gray-500">{item.timeframe}</span>
      </div>
    </Link>
  );
}
