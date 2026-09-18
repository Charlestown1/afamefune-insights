import StatusBadge from "./StatusBadge";

export default function GemCard({ item }) {
  return (
    <div className="card flex flex-col p-5">
      <div className="mb-3 flex items-center gap-3">
        {item.logo ? (
          <img src={item.logo} alt={item.name} className="h-10 w-10 rounded-full object-cover" />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-ink-700 text-xs font-bold text-gray-300">
            {item.symbol?.slice(0, 3)}
          </div>
        )}
        <div>
          <div className="font-display font-bold text-gray-50">{item.name}</div>
          <div className="text-xs text-gray-400">{item.symbol} · {item.network}</div>
        </div>
        <div className="ml-auto">
          <StatusBadge status={item.status} />
        </div>
      </div>

      {item.thesis ? (
        <p className="mb-3 line-clamp-3 text-sm text-gray-300">{item.thesis}</p>
      ) : null}

      <div className="mb-3 grid grid-cols-2 gap-2 text-xs text-gray-400">
        <div>
          <div className="text-[10px] uppercase text-gray-500">Reference</div>
          <div className="text-gray-200">{item.referencePrice || "—"}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-gray-500">Targets</div>
          <div className="text-up">{item.targetZones || "—"}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-gray-500">Market Cap</div>
          <div className="text-gray-200">{item.marketCap || "—"}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-gray-500">Risk</div>
          <div className="text-gray-200">{item.riskLevel}</div>
        </div>
      </div>

      <div className="mt-auto flex flex-wrap gap-2 pt-2 text-xs">
        {item.chartLink && (
          <a href={item.chartLink} target="_blank" rel="noopener noreferrer" className="btn-outline !px-3 !py-1.5">
            Chart
          </a>
        )}
        {item.dexLink && (
          <a href={item.dexLink} target="_blank" rel="noopener noreferrer" className="btn-outline !px-3 !py-1.5">
            DEX
          </a>
        )}
        {item.website && (
          <a href={item.website} target="_blank" rel="noopener noreferrer" className="btn-outline !px-3 !py-1.5">
            Website
          </a>
        )}
      </div>

      <p className="mt-3 text-[10px] leading-relaxed text-gray-600">
        Research idea, not financial advice. Not a guaranteed return.
      </p>
    </div>
  );
}
