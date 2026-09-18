import Link from "next/link";
import { connectDB } from "@/lib/db";
import ForexAnalysis from "@/lib/models/ForexAnalysis";
import CryptoAnalysis from "@/lib/models/CryptoAnalysis";
import CryptoGem from "@/lib/models/CryptoGem";
import { getSiteSettings } from "@/lib/getSettings";
import ForexCard from "@/components/public/ForexCard";
import CryptoCard from "@/components/public/CryptoCard";
import GemCard from "@/components/public/GemCard";
import StatusBadge from "@/components/public/StatusBadge";
import DirectionBadge from "@/components/public/DirectionBadge";
import AdSlot from "@/components/public/AdSlot";
import DisclaimerBox from "@/components/public/DisclaimerBox";
import AnnouncementsBoard from "@/components/public/AnnouncementsBoard";

const CLOSED_STATUSES = ["WON", "LOST", "TP1_HIT", "TP2_HIT", "TP3_HIT", "CLOSED"];

async function getHomeData() {
  await connectDB();

  const [forex, crypto, gems, closedForex, closedCrypto, settings] = await Promise.all([
    ForexAnalysis.find({ published: true }).sort({ createdAt: -1 }).limit(3).lean(),
    CryptoAnalysis.find({ published: true }).sort({ createdAt: -1 }).limit(3).lean(),
    CryptoGem.find({ published: true }).sort({ createdAt: -1 }).limit(3).lean(),
    ForexAnalysis.find({ published: true, status: { $in: CLOSED_STATUSES } })
      .sort({ updatedAt: -1 })
      .limit(3)
      .lean(),
    CryptoAnalysis.find({ published: true, status: { $in: CLOSED_STATUSES } })
      .sort({ updatedAt: -1 })
      .limit(3)
      .lean(),
    getSiteSettings()
  ]);

  const results = [...closedForex, ...closedCrypto]
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .slice(0, 3);

  return { forex, crypto, gems, results, settings };
}

export default async function HomePage() {
  const { forex, crypto, gems, results, settings } = await getHomeData();

  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden border-b border-ink-700 bg-gradient-to-b from-ink-900 to-ink-950">
        <div className="container-mmuo py-20 text-center sm:py-28">
          <div className="mx-auto mb-4 inline-block rounded-full border border-gold-500/30 bg-gold-500/10 px-4 py-1 text-xs font-medium tracking-wide text-gold-400">
            INDEPENDENT MARKET RESEARCH
          </div>
          <h1 className="font-display text-4xl font-bold tracking-tight text-gray-50 sm:text-6xl">
            {(settings.siteName || "MMUO").toUpperCase()}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-400">
            Forex & Crypto Market Analysis
          </p>
          <p className="mx-auto mt-3 max-w-xl text-sm text-gray-500">
            {settings.siteDescription}
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/forex" className="btn-gold">View Forex Analysis</Link>
            <Link href="/crypto" className="btn-outline">View Crypto Analysis</Link>
            {settings.telegramChannelUrl ? (
              <a href={settings.telegramChannelUrl} target="_blank" rel="noopener noreferrer" className="btn-outline">
                Join Telegram
              </a>
            ) : (
              <Link href="/telegram" className="btn-outline">Join Telegram</Link>
            )}
          </div>
        </div>
      </section>

      <AnnouncementsBoard />

      <AdSlot placement="TOP_BANNER" />

      {/* LATEST FOREX */}
      <Section title="Latest Forex Setups" viewAllHref="/forex">
        {forex.length ? (
          <Grid>{forex.map((item) => <ForexCard key={item._id} item={item} />)}</Grid>
        ) : (
          <EmptyState label="No forex analyses published yet." />
        )}
      </Section>

      <AdSlot placement="HOMEPAGE" />

      {/* CRYPTO MARKET */}
      <Section title="Crypto Market" viewAllHref="/crypto">
        {crypto.length ? (
          <Grid>{crypto.map((item) => <CryptoCard key={item._id} item={item} />)}</Grid>
        ) : (
          <EmptyState label="No crypto analyses published yet." />
        )}
      </Section>

      {/* CRYPTO GEMS */}
      <Section title="Crypto Gems" viewAllHref="/gems">
        {gems.length ? (
          <Grid>{gems.map((item) => <GemCard key={item._id} item={item} />)}</Grid>
        ) : (
          <EmptyState label="No gems highlighted yet." />
        )}
      </Section>

      {/* TRADE RESULTS */}
      <Section title="Latest Trade Results" viewAllHref="/results">
        {results.length ? (
          <div className="grid gap-4 sm:grid-cols-3">
            {results.map((r) => (
              <div key={r._id} className="card p-5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-display font-bold text-gray-50">
                    {r.pair || `${r.coin} (${r.symbol})`}
                  </span>
                  {r.direction ? <DirectionBadge direction={r.direction} /> : null}
                </div>
                <div className="mb-2 text-xs text-gray-400">
                  Entry: {r.entry || r.entryZone || "—"}
                </div>
                <StatusBadge status={r.status} />
              </div>
            ))}
          </div>
        ) : (
          <EmptyState label="No closed trades published yet." />
        )}
      </Section>

      {/* TELEGRAM CTA */}
      <section className="border-y border-ink-700 bg-ink-900">
        <div className="container-mmuo flex flex-col items-center justify-between gap-4 py-12 text-center sm:flex-row sm:text-left">
          <div>
            <h2 className="section-title">Telegram Community</h2>
            <p className="mt-1 max-w-lg text-sm text-gray-400">{settings.telegramBlurb}</p>
          </div>
          <div className="flex flex-shrink-0 gap-3">
            {settings.telegramChannelUrl && (
              <a href={settings.telegramChannelUrl} target="_blank" rel="noopener noreferrer" className="btn-gold">
                Join Channel
              </a>
            )}
            {settings.telegramGroupUrl && (
              <a href={settings.telegramGroupUrl} target="_blank" rel="noopener noreferrer" className="btn-outline">
                Join Group
              </a>
            )}
          </div>
        </div>
      </section>

      <AdSlot placement="BOTTOM_BANNER" />

      {/* SUPPORT / DONATE */}
      <section className="container-mmuo py-14 text-center">
        <h2 className="section-title">Support MMUO</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm text-gray-400">{settings.donationBlurb}</p>
        <Link href="/donate" className="btn-gold mt-6 inline-flex">Donate BNB</Link>
      </section>

      {/* DISCLAIMER */}
      <section className="container-mmuo pb-16">
        <DisclaimerBox text={settings.defaultDisclaimer} />
      </section>
    </>
  );
}

function Section({ title, viewAllHref, children }) {
  return (
    <section className="container-mmuo py-12">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="section-title">{title}</h2>
        <Link href={viewAllHref} className="text-sm font-medium text-gold-500 hover:underline">
          View all →
        </Link>
      </div>
      {children}
    </section>
  );
}

function Grid({ children }) {
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>;
}

function EmptyState({ label }) {
  return (
    <div className="card p-8 text-center text-sm text-gray-500">{label}</div>
  );
}
