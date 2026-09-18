# Afamefune Insights — Trading Operating System

A personal, AI-assisted trading journal and operating system: trade logging,
AI mentor feedback (Gemini), live market prices (Twelve Data), automatic
TP/SL trade resolution, prop-firm risk tracking, an admin dashboard,
advertisements, and a BNB Smart Chain donation section.

## Current status: Phase 4 of a multi-phase upgrade — all planned phases now complete

The app has a multi-view architecture, real automatic trade resolution
(Phase 1), real Advanced Analytics and a structured/scored AI Mentor (Phase
2), real Psychology tracking with a transparent Discipline Score and a real
Trade Calendar (Phase 3), and now a real Economic Calendar (Phase 4).
Nothing here is faked; anything not fully wired up says so plainly instead
of showing invented data.

## Tech stack

- **Backend:** Node.js, Express, Mongoose (MongoDB Atlas), Passport.js (local + Google OAuth), express-session
- **AI:** Google Gemini (`@google/generative-ai`)
- **Live prices:** Twelve Data REST API (free-tier, polling — see rate-limit notes below)
- **Frontend:** Vanilla JS/HTML/CSS, no build step — designed to be hand-edited (e.g. in Acode on Android)
- **PWA / Android:** manifest + service worker + Bubblewrap TWA config (see `android-twa/`)

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and fill in real values (see comments in that file for what each one does and where to get it).
3. `npm start` (or `node server.js`)
4. Visit `http://localhost:3000` (or your `PORT`).

On Render: set the same variables in the dashboard's Environment tab. Do not commit a real `.env` file.

## Project structure

```
afamefune-insights-main/
├── server.js                  Express app: auth, trades, prop-firm, admin, ads, market data
├── package.json
├── .env.example
├── android-twa/                Bubblewrap config + instructions for building the Android APK
│   ├── twa-manifest.json
│   └── README-ANDROID.md
└── public/
    ├── index.html               Multi-view app shell (sidebar/drawer + 13 views)
    ├── app.js                   All client-side logic (router, calculators, rendering)
    ├── style.css                Dark navy/gold theme + app-shell layout
    ├── manifest.json            PWA manifest
    ├── sw.js                    Service worker (never caches /api or /auth)
    ├── offline.html             Offline fallback page
    ├── logo.png
    └── icons/                   Generated PWA/Android icons
```

## Navigation / views

Dashboard · Trade Journal · AI Mentor · Analytics · Risk Manager · Prop Firm ·
Markets · Economic Calendar · Psychology · Trade Calendar · Position Size ·
Profile · Settings

Routing is hash-based (`#dashboard`, `#journal`, etc.) so back/forward and
bookmarking work without a frontend framework or build step.

## What's real vs. what's a placeholder (Phase 4)

**Fully functional, real data, no mocks:**
- Auth (email/password + Google OAuth), sessions, admin roles
- Trade Journal: create/list/filter/search/CSV export, prop-firm linking
- **AI Mentor:** real Gemini analysis, structured JSON output — verdict (Strong/Good/Neutral/Weak Setup/Avoid), 5 scored dimensions (technical/risk/execution/psychology/overall), and a full text breakdown, all saved per-trade and browsable. Falls back cleanly to plain-text display for older trades or if Gemini's response isn't valid JSON on a given call — never breaks trade saving.
- **Automatic trade resolution** — real live prices, real TP/SL detection, correctly covering all 18 tracked instruments
- Dashboard: real stats, real recent trades, real open-trades tracking, real risk guardrail, real next-high-impact-event widget
- Markets: 5 core instruments (existing system, unchanged) + 13 additional instruments
- Risk Manager & Position Size Calculator: real math, no placeholder numbers
- Prop Firm tracker: real drawdown/profit-target math derived live from trades
- **Advanced Analytics:** real performance stats, equity curve (R / $ / drawdown, with date-range filters), win/loss distribution, and breakdowns by pair, long/short, session, strategy, day of week, and month — computed client-side from actual trade history
- **Psychology tracking, Discipline Score, and correlations** — all from your own logged data, never inferred or invented
- **Trade Calendar** — real month-grid calendar from actual closed trades
- **Economic Calendar (new, Phase 4):** real macro-economic events (CPI, NFP, central bank rate decisions, GDP, and more) from Financial Modeling Prep, for USD/GBP/EUR/JPY/CAD/AUD/NZD/CHF, filterable by currency and impact level, plus a "next high-impact event" widget on the Dashboard. If `FMP_API_KEY` isn't set, the page says so plainly and shows nothing — never a fabricated event.
- Admin dashboard, Advertisements, BNB donation section

**All originally planned Phase 1–4 features are now implemented.** Future
work would be refinements (e.g. richer Analytics visualizations, more
instruments, alternate calendar providers) rather than new phases.

## Automatic trade resolution (new in this phase)

1. **Analyze → auto-save.** Submitting "Analyze Trade with AI" (Dashboard quick form or full Journal form) saves the trade immediately after a successful AI response — no separate "save" step.
2. **Duplicate guard.** If the same user submits an identical trade (same pair/direction/entry/SL/TP) within 15 seconds, the existing trade is returned instead of creating a second one. Covers double-taps and network retries.
3. **Server-side monitoring.** A background job (`monitorRunningTrades`, tied to the existing Twelve Data poll cycle) checks every trade with `outcome: 'Running'` against live prices:
   - **Buy:** TP triggers at `price >= TP`; SL triggers at `price <= SL`.
   - **Sell:** TP triggers at `price <= TP`; SL triggers at `price >= SL`.
   - Runs independently of any browser tab, resumes automatically after a server restart (it just re-queries MongoDB for `Running` trades), and only evaluates each user's own trades.
4. **Atomic close.** Closing a trade uses `findOneAndUpdate({_id, outcome: 'Running'}, ...)` — if two monitoring passes somehow both detect the trigger, only the first one actually applies; the second becomes a safe no-op instead of double-closing or flipping the result.
5. **No data, no guessing.** If a trade's pair isn't one of the tracked instruments, or live data is temporarily unavailable, the trade is left `Running` untouched — it is never closed on stale or missing data.
6. **R-multiple.** `realizedR` is computed from the trade's own entry/stopLoss/exit (independent of position size), stored on close, and shown in the trade modal and AI Mentor history.
7. **Toasts.** The frontend diffs each poll against the previous one and shows a real "Take Profit Hit" / "Stop Loss Hit" toast only when an actual Running→Win/Loss transition is observed — never a synthetic notification.

## Live market data & rate limits (important, read before deploying)

Twelve Data's free plan caps out at **8 credits/minute and 800 credits/day**.
This app uses two separate, independently-scheduled feeds to stay within that:

- **Core (5 instruments — GBPUSD, USDCAD, XAUUSD, BTCUSD, USDJPY):** unchanged from before Phase 1, now polling every **10 minutes** (`MARKET_POLL_INTERVAL_MS`, fixed from a previous default that slightly exceeded the daily cap). ~720 credits/day.
- **Extended (13 instruments — EURUSD, USDCHF, AUDUSD, NZDUSD, EURGBP, EURJPY, GBPJPY, GBPCHF, AUDJPY, EURAUD, EURCAD, GBPAUD, ETHUSD):** new in Phase 1, polling every **4 hours** by default (`EXTENDED_MARKET_POLL_INTERVAL_MS`), batched in groups of ≤8 with 65s spacing to respect the per-minute cap. ~78 credits/day.

If you upgrade your Twelve Data plan, lower both interval env vars for fresher data — the code doesn't need to change.

## Position Size Calculator — assumptions

- **Forex:** standard lot = 100,000 units. Pip size is 0.01 for JPY-quoted pairs, 0.0001 otherwise. Cross pairs (e.g. EURJPY, GBPAUD) use a live conversion rate from the Markets feeds; if that rate isn't cached yet, the calculator says so explicitly rather than guessing.
- **XAUUSD:** standard convention of 100oz/lot ($100 P/L per $1 move per lot).
- **BTCUSD/ETHUSD:** sized directly in coin units (linear USD P/L), avoiding any assumed contract multiplier.

## Security notes

- Every trade/prop-firm/account route is scoped to `req.user._id` from the authenticated session — never to a client-supplied id.
- Admin routes require both `isAuthenticated()` and `role === 'admin'`, checked server-side on every request — the sidebar Admin button is a convenience, not the security boundary.
- Advertisement image uploads are validated for MIME type and size server-side; destination URLs are validated as `http(s)` before saving.
- No secrets are ever sent to the frontend; `.env` is gitignored.

## Economic Calendar provider (Phase 4)

**Provider:** [Financial Modeling Prep](https://financialmodelingprep.com) — `GET /stable/economic-calendar?from=&to=&apikey=`. Chosen because it's a genuinely documented endpoint returning real macro-economic events (event name, date, country, actual/forecast/previous, impact level) rather than company earnings or a scraped feed.

**Honesty note on plan requirements:** FMP's own documentation states their free "Basic" plan includes 250 requests/day across "mostly all endpoints," but I could not personally verify with a live key whether this specific endpoint is included on Basic versus requiring a paid tier — that can also change over time on any provider's end. This app handles that gracefully either way: if the key is missing, invalid, or the endpoint returns an error/rate-limit response, the Economic Calendar page and the Dashboard widget say so plainly and show the last successfully cached events (or nothing, if there's never been a successful fetch) — never a fabricated event. If FMP's free tier turns out not to cover this endpoint, swapping providers only requires updating `fetchEconomicCalendar()` in `server.js` — the rest of the app (filtering, currency mapping, the Dashboard widget, the tests) works against the normalized internal event shape, not FMP's specific field names.

**Scope:** only events mapped to USD, GBP, EUR, JPY, CAD, AUD, NZD, or CHF are shown (via a country→currency lookup table) — real events for other countries that FMP returns are filtered out rather than displayed unlabeled.

**Refresh:** every 30 minutes by default (`ECONOMIC_CALENDAR_POLL_INTERVAL_MS`), fetching a rolling window from 3 days ago to 21 days ahead (well within FMP's documented 90-day max range per request).

## Automated tests

`npm test` runs four test suites (`tests/*.test.js`) that execute the
**actual, current source code** — extracted verbatim from `server.js` and
`app.js`, not reimplemented — against hand-built fake data, so a pass
reflects the real code's real behavior:

- `trade-lifecycle.test.js` — BUY/SELL TP/SL triggers, duplicate-closure idempotency, missing-data handling, multi-user isolation, multi-trade independence, restart-recovery, and the extended-instrument monitoring path.
- `analytics.test.js` — win rate, expectancy, profit factor, drawdown, recovery factor, streaks, and edge cases (empty data, all-wins).
- `ai-parsing.test.js` — the Gemini structured-JSON parsing/fallback path, including malformed responses and partial data.
- `discipline-score.test.js` — weight redistribution when categories have no logged data, correct fraction math, Running-trade exclusion, and the overtrading-detection median calculation (an off-by-one in the original median math was caught and fixed by this exact test during Phase 3 development).
- `economic-calendar.test.js` — normalizes FMP's own published sample response correctly, maps country codes/name variants (UK vs GB) to currency, drops malformed events, sanitizes event text, sorts chronologically, and never coerces a real `null` (e.g. an event with no released "actual" value yet) into a misleading 0.

Run them anytime after making changes: `npm test`.

## Known limitations / what's next

- See "Economic Calendar provider" above for the honest caveat on FMP's free-tier coverage of this specific endpoint.
- The AI Mentor's "psychology" score is deliberately limited to what your notes/thesis actually reveal — if they don't describe your emotional state or decision process, the AI is instructed to score it a neutral 50 and say so, rather than inventing behavioral claims. The separate Psychology page's Discipline Score and correlations are the more reliable source, since those come from your own logged ratings, not AI inference.
- Position size for exotic pairs outside the listed 18 instruments isn't supported — the calculator only lists pairs with a verified, correct pip/conversion path.
- Extended-instrument trades (13 of the 18) are monitored against a price that can be up to ~4 hours stale between refreshes, a disclosed rate-limit tradeoff, not a bug.
- Psychology check-in is only collected on the full Trade Journal form, not the Dashboard's Quick Analyze form, to keep quick entry fast — psychology data can only be logged at trade-submission time, since there's no separate "edit trade" flow yet.
- Trade Calendar and Discipline Score both use closed-trade `closedAt` timestamps in the browser's local timezone for day-bucketing; a trade closed right at midnight could land on a different calendar day than expected depending on your timezone. The Economic Calendar instead displays FMP's own event timestamps as-is, without reinterpreting them into a guessed timezone.
- All four originally planned phases are now implemented. Remaining ideas (more chart types, additional instruments, an alternate/paid calendar provider for guaranteed coverage) are refinements, not blocking gaps.
