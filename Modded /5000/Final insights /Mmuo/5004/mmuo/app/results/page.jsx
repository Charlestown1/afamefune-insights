import { connectDB } from "@/lib/db";
import ForexAnalysis from "@/lib/models/ForexAnalysis";
import CryptoAnalysis from "@/lib/models/CryptoAnalysis";
import StatusBadge from "@/components/public/StatusBadge";
import DirectionBadge from "@/components/public/DirectionBadge";

export const metadata = {
  title: "Trade Results & Track Record",
  description: "Historical published trade results and track record from MMUO."
};

export const dynamic = "force-dynamic";

const CLOSED_STATUSES = ["WON", "LOST", "TP1_HIT", "TP2_HIT", "TP3_HIT", "CLOSED", "CANCELLED"];

async function getResults() {
  await connectDB();
  const [forex, crypto] = await Promise.all([
    ForexAnalysis.find({ published: true, status: { $in: CLOSED_STATUSES } }).sort({ updatedAt: -1 }).lean(),
    CryptoAnalysis.find({ published: true, status: { $in: CLOSED_STATUSES } }).sort({ updatedAt: -1 }).lean()
  ]);

  const combined = [
    ...forex.map((f) => ({ ...f, kind: "forex", label: f.pair })),
    ...crypto.map((c) => ({ ...c, kind: "crypto", label: `${c.coin} (${c.symbol})` }))
  ].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  const wins = combined.filter((t) => t.status === "WON" || t.status.startsWith("TP")).length;
  const losses = combined.filter((t) => t.status === "LOST").length;
  const total = combined.length;
  const winRate = total ? Math.round((wins / (wins + losses || 1)) * 100) : 0;

  return { combined, stats: { total, wins, losses, winRate } };
}

export default async function ResultsPage() {
  const { combined, stats } = await getResults();

  return (
    <div className="container-mmuo py-10">
      <h1 className="section-title mb-2">Trade Results / Track Record</h1>
      <p className="mb-6 max-w-2xl text-sm text-gray-400">
        Historical published trades and their outcomes, updated only when we explicitly close a
        trade in our system. Past results do not guarantee future performance.
      </p>

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Published Trades" value={stats.total} />
        <Stat label="Wins" value={stats.wins} tone="text-up" />
        <Stat label="Losses" value={stats.losses} tone="text-down" />
        <Stat label="Win Rate" value={`${stats.winRate}%`} />
      </div>

      {combined.length ? (
        <div className="table-wrap">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-ink-800 text-xs uppercase text-gray-400">
              <tr>
                <th className="px-4 py-3">Asset</th>
                <th className="px-4 py-3">Direction</th>
                <th className="px-4 py-3">Entry</th>
                <th className="px-4 py-3">Result</th>
                <th className="px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-800">
              {combined.map((t) => (
                <tr key={t._id} className="hover:bg-ink-800/50">
                  <td className="px-4 py-3 font-medium text-gray-100">{t.label}</td>
                  <td className="px-4 py-3">
                    {t.direction ? <DirectionBadge direction={t.direction} /> : "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-300">{t.entry || t.entryZone || "—"}</td>
                  <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(t.updatedAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card p-10 text-center text-sm text-gray-500">
          No closed trades published yet.
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div className="card p-4 text-center">
      <div className={`font-display text-2xl font-bold ${tone || "text-gray-100"}`}>{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wide text-gray-500">{label}</div>
    </div>
  );
}
