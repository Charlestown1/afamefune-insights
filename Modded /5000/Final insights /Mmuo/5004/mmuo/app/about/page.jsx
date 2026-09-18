import { getSiteSettings } from "@/lib/getSettings";

export const metadata = {
  title: "About MMUO",
  description: "Learn about MMUO, an independent forex and crypto market analysis platform."
};

export default async function AboutPage() {
  const settings = await getSiteSettings();

  return (
    <div className="container-mmuo max-w-3xl py-14">
      <h1 className="section-title mb-6">About {settings.siteName}</h1>

      <div className="space-y-5 text-sm leading-relaxed text-gray-300">
        <p>
          {settings.siteName} is an independent platform for forex analysis, crypto analysis,
          trading ideas, market research, and educational market commentary. We publish our own
          market reads, trade setups, and coins/tokens we're personally watching.
        </p>
        <p>
          Everything published on {settings.siteName} reflects our own analysis and opinion at the
          time it was written. Markets change quickly, and no analysis — however well-researched —
          can predict future price movement with certainty.
        </p>
        <p>
          We do not promise guaranteed profits, guaranteed accuracy, or guaranteed returns on any
          coin, token, or trade idea we highlight. Every trade and investment carries risk,
          including the risk of losing your full investment.
        </p>
        <p>
          Our track record is maintained transparently on the{" "}
          <a href="/results" className="text-gold-500 hover:underline">Results</a> page, and only
          updated when we explicitly close a position.
        </p>
      </div>

      <h2 className="section-title mb-4 mt-12 text-xl">Full Disclaimer</h2>
      <div className="card p-6 text-xs leading-relaxed text-gray-400">
        {settings.defaultDisclaimer}
      </div>
    </div>
  );
}
