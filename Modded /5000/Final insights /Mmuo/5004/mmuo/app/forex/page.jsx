import { connectDB } from "@/lib/db";
import ForexAnalysis from "@/lib/models/ForexAnalysis";
import ForexCard from "@/components/public/ForexCard";
import ForexFilters from "@/components/public/ForexFilters";
import AdSlot from "@/components/public/AdSlot";

export const metadata = {
  title: "Forex Analysis & Trading Signals",
  description: "Live forex market analysis, technical setups, and trading signals from MMUO."
};

export const dynamic = "force-dynamic";

async function getForex(searchParams) {
  await connectDB();
  const query = { published: true };
  if (searchParams.pair) query.pair = searchParams.pair.toUpperCase();
  if (searchParams.status) query.status = searchParams.status;
  if (searchParams.timeframe) query.timeframe = searchParams.timeframe;

  return ForexAnalysis.find(query).sort({ createdAt: -1 }).limit(60).lean();
}

export default async function ForexPage({ searchParams }) {
  const items = await getForex(searchParams || {});

  return (
    <div className="container-mmuo py-10">
      <h1 className="section-title mb-2">Forex Analysis</h1>
      <p className="mb-6 max-w-2xl text-sm text-gray-400">
        Technical and fundamental forex analysis, trade setups, and signal updates. Analysis is
        informational and not financial advice — always manage your own risk.
      </p>

      <ForexFilters basePath="/forex" />

      {items.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <ForexCard key={item._id} item={item} />
          ))}
        </div>
      ) : (
        <div className="card p-10 text-center text-sm text-gray-500">
          No forex analyses match your filters yet.
        </div>
      )}

      <AdSlot placement="FOREX_PAGE" />
    </div>
  );
}
