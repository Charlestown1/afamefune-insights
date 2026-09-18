import { connectDB } from "@/lib/db";
import ForexAnalysis from "@/lib/models/ForexAnalysis";
import CryptoAnalysis from "@/lib/models/CryptoAnalysis";
import CryptoGem from "@/lib/models/CryptoGem";
import Advertisement from "@/lib/models/Advertisement";
import StatusBadge from "@/components/public/StatusBadge";

export const dynamic = "force-dynamic";

async function getStats() {
  await connectDB();

  const [
    forexPublished,
    cryptoPublished,
    gemsPublished,
    forexWon,
    forexLost,
    cryptoWon,
    cryptoLost,
    forexActive,
    cryptoActive,
    adsActive,
    recentForex,
    recentCrypto
  ] = await Promise.all([
    ForexAnalysis.countDocuments({ published: true }),
    CryptoAnalysis.countDocuments({ published: true }),
    CryptoGem.countDocuments({ published: true }),
    ForexAnalysis.countDocuments({ status: "WON" }),
    ForexAnalysis.countDocuments({ status: "LOST" }),
    CryptoAnalysis.countDocuments({ status: "WON" }),
    CryptoAnalysis.countDocuments({ status: "LOST" }),
    ForexAnalysis.countDocuments({ status: "ACTIVE" }),
    CryptoAnalysis.countDocuments({ status: "ACTIVE" }),
    Advertisement.countDocuments({ active: true }),
    ForexAnalysis.find({}).sort({ createdAt: -1 }).limit(5).lean(),
    CryptoAnalysis.find({}).sort({ createdAt: -1 }).limit(5).lean()
  ]);

  const recentActivity = [
    ...recentForex.map((f) => ({ ...f, kind: "Forex", label: f.pair })),
    ...recentCrypto.map((c) => ({ ...c, kind: "Crypto", label: `${c.coin} (${c.symbol})` }))
  ]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 8);

  return {
    forexPublished,
    cryptoPublished,
    gemsPublished,
    totalSignals: forexPublished + cryptoPublished,
    won: forexWon + cryptoWon,
    lost: forexLost + cryptoLost,
    active: forexActive + cryptoActive,
    adsActive,
    recentActivity
  };
}

export default async function DashboardOverviewPage() {
  const stats = await getStats();

  return (
    <div>
      <h1 className="mb-6 font-display text-2xl font-bold text-gray-50">Dashboard Overview</h1>

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card label="Forex Analyses" value={stats.forexPublished} />
        <Card label="Crypto Analyses" value={stats.cryptoPublished} />
        <Card label="Crypto Gems" value={stats.gemsPublished} />
        <Card label="Total Published" value={stats.totalSignals} />
        <Card label="Winning Trades" value={stats.won} tone="text-up" />
        <Card label="Losing Trades" value={stats.lost} tone="text-down" />
        <Card label="Active Trades" value={stats.active} tone="text-blue-400" />
        <Card label="Active Ads" value={stats.adsActive} />
      </div>

      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-gray-400">
        Recent Activity
      </h2>
      <div className="table-wrap">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-ink-800 text-xs uppercase text-gray-400">
            <tr>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Published</th>
              <th className="px-4 py-3">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-800">
            {stats.recentActivity.map((item) => (
              <tr key={item._id}>
                <td className="px-4 py-3 text-gray-400">{item.kind}</td>
                <td className="px-4 py-3 font-medium text-gray-100">{item.label}</td>
                <td className="px-4 py-3"><StatusBadge status={item.status} /></td>
                <td className="px-4 py-3 text-gray-400">{item.published ? "Yes" : "Draft"}</td>
                <td className="px-4 py-3 text-gray-500">
                  {new Date(item.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
            {!stats.recentActivity.length && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  No content yet — start by creating a forex or crypto analysis.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Card({ label, value, tone }) {
  return (
    <div className="card p-4">
      <div className={`font-display text-2xl font-bold ${tone || "text-gray-100"}`}>{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wide text-gray-500">{label}</div>
    </div>
  );
}
