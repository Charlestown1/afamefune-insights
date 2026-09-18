import Link from "next/link";
import StatusBadge from "./StatusBadge";

export default function CryptoCard({ item }) {
  return (
    <Link href={`/crypto/${item._id}`} className="card block p-5 transition hover:border-gold-500/50">
      <div className="mb-3 flex items-center justify-between">
        <div className="font-display text-lg font-bold text-gray-50">
          {item.coin} <span className="text-sm text-gray-400">({item.symbol})</span>
        </div>
        <StatusBadge status={item.status} />
      </div>

      <h3 className="mb-3 line-clamp-2 text-sm font-medium text-gray-200">{item.title}</h3>

      <div className="mb-3 grid grid-cols-3 gap-2 text-xs text-gray-400">
        <div>
          <div className="text-[10px] uppercase text-gray-500">Ref. Price</div>
          <div className="text-gray-200">{item.referencePrice || "—"}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-gray-500">Target 1</div>
          <div className="text-up">{item.target1 || "—"}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-gray-500">Invalidation</div>
          <div className="text-down">{item.invalidation || "—"}</div>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>{item.network || ""}</span>
        <span>Risk: {item.riskLevel}</span>
      </div>
    </Link>
  );
}
