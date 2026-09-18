import "./globals.css";
import Link from "next/link";
import { getSiteSettings } from "@/lib/getSettings";
import AnnouncementBanner from "@/components/public/AnnouncementBanner";

export async function generateMetadata() {
  const settings = await getSiteSettings().catch(() => null);
  const siteName = settings?.siteName || "MMUO";
  const description =
    settings?.siteDescription ||
    "MMUO provides independent forex and crypto market analysis, trading setups, and research.";
  const publicUrl = process.env.PUBLIC_URL || "https://mmuo.onrender.com";

  return {
    metadataBase: new URL(publicUrl),
    title: {
      default: `${siteName} — Forex & Crypto Market Analysis`,
      template: `%s | ${siteName}`
    },
    description,
    openGraph: {
      title: `${siteName} — Forex & Crypto Market Analysis`,
      description,
      url: publicUrl,
      siteName,
      type: "website"
    },
    twitter: {
      card: "summary_large_image",
      title: `${siteName} — Forex & Crypto Market Analysis`,
      description
    },
    robots: { index: true, follow: true }
  };
}

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/forex", label: "Forex" },
  { href: "/crypto", label: "Crypto" },
  { href: "/gems", label: "Gems" },
  { href: "/results", label: "Results" },
  { href: "/telegram", label: "Telegram" },
  { href: "/about", label: "About" }
];

export default async function RootLayout({ children }) {
  const settings = await getSiteSettings().catch(() => null);

  return (
    <html lang="en">
      <body className="min-h-screen bg-ink-950 font-sans antialiased">
        {settings?.announcementBannerActive && settings?.announcementBannerText ? (
          <AnnouncementBanner text={settings.announcementBannerText} />
        ) : null}

        <header className="sticky top-0 z-40 border-b border-ink-700 bg-ink-950/95 backdrop-blur">
          <div className="container-mmuo flex h-16 items-center justify-between">
            <Link href="/" className="font-display text-xl font-bold tracking-wide text-gray-50">
              {(settings?.siteName || "MMUO").toUpperCase()}
            </Link>

            <nav className="hidden items-center gap-6 md:flex">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm text-gray-300 transition hover:text-gold-400"
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            <div className="flex items-center gap-3">
              <Link href="/donate" className="btn-gold hidden sm:inline-flex">
                Donate
              </Link>
              <MobileNav links={NAV_LINKS} />
            </div>
          </div>
        </header>

        <main>{children}</main>

        <footer className="border-t border-ink-700 bg-ink-900">
          <div className="container-mmuo grid gap-8 py-12 md:grid-cols-3">
            <div>
              <div className="font-display text-lg font-bold text-gray-100">
                {(settings?.siteName || "MMUO").toUpperCase()}
              </div>
              <p className="mt-2 max-w-sm text-sm text-gray-400">
                {settings?.siteDescription ||
                  "Independent forex and crypto market analysis, trading setups, and research."}
              </p>
            </div>

            <div>
              <div className="label">Navigate</div>
              <ul className="mt-2 space-y-1.5 text-sm text-gray-400">
                {NAV_LINKS.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="hover:text-gold-400">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <div className="label">Disclaimer</div>
              <p className="mt-2 text-xs leading-relaxed text-gray-500">
                {(settings?.defaultDisclaimer || "").slice(0, 260)}
                {(settings?.defaultDisclaimer || "").length > 260 ? "…" : ""}{" "}
                <Link href="/about" className="text-gold-500 hover:underline">
                  Read more
                </Link>
              </p>
            </div>
          </div>

          <div className="border-t border-ink-800 py-4 text-center text-xs text-gray-600">
            {settings?.footerText || `© ${new Date().getFullYear()} ${settings?.siteName || "MMUO"}. All rights reserved.`}
          </div>
        </footer>
      </body>
    </html>
  );
}

function MobileNav({ links }) {
  return (
    <details className="relative md:hidden">
      <summary className="list-none rounded-md border border-ink-600 p-2 text-gray-200">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
        </svg>
      </summary>
      <div className="absolute right-0 z-50 mt-2 w-48 rounded-md border border-ink-700 bg-ink-850 p-2 shadow-card">
        {links.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="block rounded px-3 py-2 text-sm text-gray-200 hover:bg-ink-800 hover:text-gold-400"
          >
            {link.label}
          </a>
        ))}
        <a
          href="/donate"
          className="mt-1 block rounded px-3 py-2 text-sm font-semibold text-gold-500 hover:bg-ink-800"
        >
          Donate
        </a>
      </div>
    </details>
  );
}
