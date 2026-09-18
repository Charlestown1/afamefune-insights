import { notFound } from "next/navigation";
import { connectDB } from "@/lib/db";
import ForexAnalysis from "@/lib/models/ForexAnalysis";
import StatusBadge from "@/components/public/StatusBadge";
import DirectionBadge from "@/components/public/DirectionBadge";

async function getItem(id) {
  await connectDB();
  const item = await ForexAnalysis.findOne({ _id: id, published: true }).lean();
  return item;
}

export async function generateMetadata({ params }) {
  const item = await getItem(params.id).catch(() => null);
  if (!item) return { title: "Analysis not found" };
  return {
    title: `${item.pair} ${item.direction} — ${item.title}`,
    description: item.tradeSetupExplanation?.slice(0, 160) || item.title
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

export default async function ForexDetailPage({ params }) {
  const item = await getItem(params.id);
  if (!item) notFound();

  return (
    <div className="container-mmuo max-w-4xl py-10">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl font-bold text-gray-50">{item.pair}</h1>
        <DirectionBadge direction={item.direction} />
        <StatusBadge status={item.status} />
        <span className="ml-auto text-xs text-gray-500">
          {new Date(item.createdAt).toLocaleDateString()} · {item.timeframe}
        </span>
      </div>

      <h2 className="mb-6 text-lg font-medium text-gray-200">{item.title}</h2>

      {item.chartImage ? (
        <img src={item.chartImage} alt={`${item.pair} chart`} className="mb-8 w-full rounded-lg border border-ink-700" />
      ) : null}

      <div className="mb-8 grid gap-6 sm:grid-cols-2">
        <div className="card p-5">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">Trade Levels</h3>
          <Row label="Entry" value={item.entry} />
          <Row label="Stop Loss" value={item.stopLoss} tone="text-down" />
          <Row label="Take Profit 1" value={item.takeProfit1} tone="text-up" />
          <Row label="Take Profit 2" value={item.takeProfit2} tone="text-up" />
          <Row label="Take Profit 3" value={item.takeProfit3} tone="text-up" />
          <Row label="Risk / Reward" value={item.riskReward} />
        </div>
        <div className="card p-5">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">Key Levels</h3>
          <Row label="Support" value={item.keySupportLevels} />
          <Row label="Resistance" value={item.keyResistanceLevels} />
          <Row label="Timeframe" value={item.timeframe} />
        </div>
      </div>

      <TextBlock title="Market Structure" text={item.marketStructure} />
      <TextBlock title="Technical Analysis" text={item.technicalAnalysis} />
      <TextBlock title="Fundamental Context" text={item.fundamentalContext} />
      <TextBlock title="Trade Setup" text={item.tradeSetupExplanation} />

      <div className="card mt-8 border-ink-600 p-4 text-xs text-gray-400">
        {item.riskWarning}
      </div>
    </div>
  );
}
