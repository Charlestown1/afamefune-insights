import { notFound } from "next/navigation";
import { connectDB } from "@/lib/db";
import CryptoAnalysis from "@/lib/models/CryptoAnalysis";
import StatusBadge from "@/components/public/StatusBadge";

async function getItem(id) {
  await connectDB();
  return CryptoAnalysis.findOne({ _id: id, published: true }).lean();
}

export async function generateMetadata({ params }) {
  const item = await getItem(params.id).catch(() => null);
  if (!item) return { title: "Analysis not found" };
  return {
    title: `${item.coin} (${item.symbol}) — ${item.title}`,
    description: item.marketThesis?.slice(0, 160) || item.title
  };
}

function Row({ label, value, tone }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between border-b border-ink-800 py-2 text-sm last:border-0">
      <span className="text-gray-500">{label}</span>
      <span className={`font-medium ${tone || "text-gray-100"}`}>{value}</span>
    </div>
  );
}

function TextBlock({ title, text }) {
  if (!text) return null;
  return (
    <div className="mb-6">
      <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-gold-500">{title}</h3>
      <p className="whitespace-pre-line text-sm leading-relaxed text-gray-300">{text}</p>
    </div>
  );
}

export default async function CryptoDetailPage({ params }) {
  const item = await getItem(params.id);
  if (!item) notFound();

  return (
    <div className="container-mmuo max-w-4xl py-10">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl font-bold text-gray-50">
          {item.coin} <span className="text-xl text-gray-400">({item.symbol})</span>
        </h1>
        <StatusBadge status={item.status} />
        <span className="ml-auto text-xs text-gray-500">
          {new Date(item.createdAt).toLocaleDateString()} · {item.timeframe}
        </span>
      </div>

      <h2 className="mb-6 text-lg font-medium text-gray-200">{item.title}</h2>

      {item.chartImage ? (
        <img src={item.chartImage} alt={`${item.coin} chart`} className="mb-8 w-full rounded-lg border border-ink-700" />
      ) : null}

      <div className="mb-8 grid gap-6 sm:grid-cols-2">
        <div className="card p-5">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">Levels</h3>
          <Row label="Reference Price" value={item.referencePrice} />
          <Row label="Entry Zone" value={item.entryZone} />
          <Row label="Target 1" value={item.target1} tone="text-up" />
          <Row label="Target 2" value={item.target2} tone="text-up" />
          <Row label="Target 3" value={item.target3} tone="text-up" />
          <Row label="Invalidation" value={item.invalidation} tone="text-down" />
        </div>
        <div className="card p-5">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">Info</h3>
          <Row label="Network" value={item.network} />
          <Row label="Timeframe" value={item.timeframe} />
          <Row label="Risk Level" value={item.riskLevel} />
        </div>
      </div>

      <TextBlock title="Market Thesis" text={item.marketThesis} />
      <TextBlock title="Technical Analysis" text={item.technicalAnalysis} />
      <TextBlock title="Fundamental Notes" text={item.fundamentalNotes} />

      <div className="card mt-8 border-ink-600 p-4 text-xs text-gray-400">
        This is market research, not financial advice. Crypto assets are highly volatile — always
        do your own research and manage risk accordingly.
      </div>
    </div>
  );
}
