import { getSiteSettings } from "@/lib/getSettings";

export const metadata = {
  title: "Telegram Community",
  description: "Join the MMUO Telegram channel and group for market updates and signals."
};

export default async function TelegramPage() {
  const settings = await getSiteSettings();

  return (
    <div className="container-mmuo max-w-3xl py-14 text-center">
      <h1 className="section-title mb-3">Telegram Community</h1>
      <p className="mx-auto mb-10 max-w-xl text-sm text-gray-400">{settings.telegramBlurb}</p>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="card p-8">
          <h2 className="mb-2 font-display text-lg font-bold text-gray-100">Free Channel</h2>
          <p className="mb-6 text-sm text-gray-400">
            Market updates, published analysis, and announcements.
          </p>
          {settings.telegramChannelUrl ? (
            <a href={settings.telegramChannelUrl} target="_blank" rel="noopener noreferrer" className="btn-gold w-full">
              Join Telegram Channel
            </a>
          ) : (
            <span className="btn-outline w-full cursor-not-allowed opacity-50">Coming soon</span>
          )}
        </div>

        <div className="card p-8">
          <h2 className="mb-2 font-display text-lg font-bold text-gray-100">Community Group</h2>
          <p className="mb-6 text-sm text-gray-400">
            Discuss markets with other members of the MMUO community.
          </p>
          {settings.telegramGroupUrl ? (
            <a href={settings.telegramGroupUrl} target="_blank" rel="noopener noreferrer" className="btn-gold w-full">
              Join Telegram Group
            </a>
          ) : (
            <span className="btn-outline w-full cursor-not-allowed opacity-50">Coming soon</span>
          )}
        </div>
      </div>

      <p className="mt-10 text-xs text-gray-600">
        Additional signals and market updates may be posted in these communities. Nothing shared
        there is financial advice.
      </p>
    </div>
  );
}
