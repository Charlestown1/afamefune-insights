import { connectDB } from "@/lib/db";
import CryptoGem from "@/lib/models/CryptoGem";
import GemCard from "@/components/public/GemCard";
import AdSlot from "@/components/public/AdSlot";

export const metadata = {
  title: "Crypto Gems — Coins To Watch",
  description: "Curated crypto gems and market ideas from MMUO. Research, not financial advice."
};

export const dynamic = "force-dynamic";

async function getGems(searchParams) {
  await connectDB();
  const query = { published: true };
  if (searchParams.status) query.status = searchParams.status;
  return CryptoGem.find(query).sort({ createdAt: -1 }).limit(60).lean();
}

export default async function GemsPage({ searchParams }) {
  const gems = await getGems(searchParams || {});

  return (
    <div className="container-mmuo py-10">
      <h1 className="section-title mb-2">Crypto Gems</h1>
      <p className="mb-6 max-w-2xl text-sm text-gray-400">
        Coins and tokens we're personally watching as potential opportunities. These are market
        ideas and research — not guaranteed returns, and not financial advice.
      </p>

      {gems.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {gems.map((item) => (
            <GemCard key={item._id} item={item} />
          ))}
        </div>
      ) : (
        <div className="card p-10 text-center text-sm text-gray-500">No gems highlighted yet.</div>
      )}

      <AdSlot placement="GEMS_PAGE" />
    </div>
  );
}
