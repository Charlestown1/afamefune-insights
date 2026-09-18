"use client";

import { useRouter, useSearchParams } from "next/navigation";

const STATUSES = ["", "ANALYSIS", "SIGNAL", "ACTIVE", "TP1_HIT", "TP2_HIT", "TP3_HIT", "WON", "LOST", "CANCELLED", "CLOSED"];
const TIMEFRAMES = ["", "5M", "15M", "1H", "4H", "1D", "1W"];

export default function ForexFilters({ basePath = "/forex", showPair = true }) {
  const router = useRouter();
  const params = useSearchParams();

  function update(key, value) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`${basePath}?${next.toString()}`);
  }

  return (
    <div className="mb-6 flex flex-wrap gap-3">
      {showPair && (
        <input
          className="input max-w-[180px]"
          placeholder="Search pair e.g. EUR/USD"
          defaultValue={params.get("pair") || ""}
          onKeyDown={(e) => {
            if (e.key === "Enter") update("pair", e.currentTarget.value);
          }}
        />
      )}
      <select className="input max-w-[160px]" defaultValue={params.get("status") || ""} onChange={(e) => update("status", e.target.value)}>
        {STATUSES.map((s) => (
          <option key={s} value={s}>{s ? s.replace(/_/g, " ") : "All statuses"}</option>
        ))}
      </select>
      <select className="input max-w-[140px]" defaultValue={params.get("timeframe") || ""} onChange={(e) => update("timeframe", e.target.value)}>
        {TIMEFRAMES.map((t) => (
          <option key={t} value={t}>{t || "All timeframes"}</option>
        ))}
      </select>
    </div>
  );
}
