import { connectDB } from "@/lib/db";
import CryptoAnalysis from "@/lib/models/CryptoAnalysis";
import CryptoGem from "@/lib/models/CryptoGem";
import CryptoCard from "@/components/public/CryptoCard";
import GemCard from "@/components/public/GemCard";
import AdSlot from "@/components/public/AdSlot";
import Link from "next/link";

export const metadata = {
  title: "Crypto Analysis & Market Ideas",
  description: "Crypto market analysis, trade setups, and research from MMUO."
};

export const dynamic = "force-dynamic";

async function getData(searchParams) {
  await connectDB();
  const query = { published: true };
  if (searchParams.symbol) query.symbol = searchParams.symbol.toUpperCase();
  if (searchParams.status) query.status = searchParams.status;

  const [analyses, gems] = await Promise.all([
    CryptoAnalysis.find(query).sort({ createdAt: -1 }).limit(60).lean(),
    CryptoGem.find({ published: true }).sort({ createdAt: -1 }).limit(3).lean()
  ]);
  return { analyses, gems };
}

export default async function CryptoPage({ searchParams }) {
  const { analyses, gems } = await getData(searchParams || {});

  return (
    <div className="container-mmuo py-10">
      <h1 className="section-title mb-2">Crypto Analysis</h1>
      <p className="mb-6 max-w-2xl text-sm text-gray-400">
        Market ideas, technical setups, and research notes on crypto assets. Informational only —
        not financial advice.
      </p>

      {analyses.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {analyses.map((item) => (
            <CryptoCard key={item._id} item={item} />
          ))}
        </div>
      ) : (
        <div className="card p-10 text-center text-sm text-gray-500">
          No crypto analyses published yet.
        </div>
      )}

      <AdSlot placement="CRYPTO_PAGE" />

      <div className="mt-14">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="section-title">Crypto Gems</h2>
          <Link href="/gems" className="text-sm font-medium text-gold-500 hover:underline">
            View all →
          </Link>
        </div>
        {gems.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {gems.map((item) => (
              <GemCard key={item._id} item={item} />
            ))}
          </div>
        ) : (
          <div className="card p-10 text-center text-sm text-gray-500">No gems highlighted yet.</div>
        )}
      </div>
    </div>
  );
}
