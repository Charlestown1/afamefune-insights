# MMUO — Forex & Crypto Market Analysis Platform

A full-stack Next.js application: public marketing/analysis site + a secure,
single-admin dashboard for publishing forex analysis, crypto analysis, crypto
gems, trade results, advertisements, announcements, and site settings —
all without touching code.

## Stack

- **Framework:** Next.js 14 (App Router, React 18)
- **Database:** MongoDB (via Mongoose) — use MongoDB Atlas for production
- **Auth:** Custom email+password admin login. bcrypt password hashing,
  signed HTTP-only session cookie (JWT via `jose`), route protection in
  `middleware.js` AND re-checked in every API route (defense in depth),
  in-memory rate limiting / lockout on the login endpoint.
- **Styling:** Tailwind CSS, dark "financial research" theme
- **Images:** Local upload to `/public/uploads` with type/size validation
  (see note below about Render's ephemeral disk)

No live price feeds, no public accounts/login, no fake data anywhere —
every number on the public site comes from what you publish in `/admin`.

---

## 1. Project structure

```
mmuo/
├── app/                      # Pages + API routes (Next.js App Router)
│   ├── admin/login/          # Admin login page
│   ├── admin/dashboard/      # Protected admin dashboard (all sections)
│   ├── api/                  # REST API routes (admin CRUD + public reads)
│   ├── forex/ crypto/ gems/  # Public pages
│   ├── results/ about/ ...
│   ├── layout.jsx            # Global nav/footer, SEO metadata
│   ├── page.jsx              # Homepage
│   ├── robots.js sitemap.js  # SEO
├── components/
│   ├── admin/                # Admin dashboard UI (nav, CRUD manager, upload)
│   └── public/                # Public site UI (cards, badges, donate widget)
├── lib/
│   ├── models/                # Mongoose schemas (one per content type)
│   ├── db.js                  # MongoDB connection
│   ├── auth.js                 # Session creation/verification
│   ├── rateLimit.js            # Login brute-force protection
│   └── getSettings.js          # Site settings singleton helper
├── middleware.js              # Protects /admin/dashboard/* and admin API routes
├── scripts/hash-password.js   # Generates your ADMIN_PASSWORD_HASH
├── .env.example
└── package.json
```

---

## 2. Run it locally

**Requirements:** Node.js 18.18+ and a MongoDB connection string.

```bash
npm install
cp .env.example .env
```

Edit `.env`:

```
MONGO_URI=your MongoDB Atlas connection string
SESSION_SECRET=          # generate below
ADMIN_EMAIL=charlesafamefune@gmail.com
ADMIN_PASSWORD_HASH=     # generate below
NODE_ENV=development
PUBLIC_URL=http://localhost:3000
```

Generate a session secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Generate your admin password hash (you'll be prompted to type a password —
never put the plain password in any file):

```bash
npm run hash-password
```

Paste the printed hash into `ADMIN_PASSWORD_HASH` in `.env`.

Then run:

```bash
npm run dev
```

Visit `http://localhost:3000` for the public site and
`http://localhost:3000/admin/login` to sign in.

---

## 3. MongoDB Atlas (free tier works)

1. Create a free cluster at mongodb.com/atlas.
2. Create a database user (Database Access) with a strong password.
3. Under Network Access, allow access from anywhere (`0.0.0.0/0`) — Render's
   IPs aren't static, so this is the practical option; the database itself
   is still protected by the username/password in your connection string.
4. Copy the connection string ("Connect" → "Drivers") into `MONGO_URI`.

---

## 4. Deploying to Render

1. Push this project to a **private** GitHub repository (never commit `.env`).
2. On Render: **New → Web Service**, connect the repo.
3. Build command: `npm install && npm run build`
4. Start command: `npm start`
5. Add environment variables in Render's dashboard (Environment tab):
   - `MONGO_URI`
   - `SESSION_SECRET`
   - `ADMIN_EMAIL` = `charlesafamefune@gmail.com`
   - `ADMIN_PASSWORD_HASH`
   - `NODE_ENV` = `production`
   - `PUBLIC_URL` = `https://mmuo.onrender.com` (or your actual Render URL)
6. Deploy. Your admin login will be at `https://mmuo.onrender.com/admin/login`.

**Important — image uploads on Render:** Render's filesystem is ephemeral on
web services, meaning anything written to `/public/uploads` at runtime can be
wiped on redeploy or restart. For anything beyond quick testing, swap the
upload route (`app/api/upload/route.js`) to push to a real object store
(Cloudinary, AWS S3, Backblaze B2, etc.) and store the returned URL instead —
the validation logic (type/size checks) stays the same either way.

---

## 5. How content publishing works

1. Log in at `/admin/login`.
2. Go to **Forex** (or Crypto / Gems / Ads / Announcements).
3. Click **Create New**, fill in the fields, check **Published**, click Save.
4. It immediately appears on the matching public page (`/forex`, `/crypto`,
   `/gems`) and on relevant homepage sections.
5. To update a trade's outcome, click **Edit** on that item, change **Status**
   (e.g. `ACTIVE` → `WON`), save. The public site updates instantly. Historical
   records are never deleted automatically — only if you explicitly click
   **Delete**.

**Design note on "Trade Results":** rather than a separate duplicate ledger,
the public `/results` page and the win/loss stats pull directly from your
Forex and Crypto analyses whose status is one of `WON`, `LOST`, `TP1_HIT`,
`TP2_HIT`, `TP3_HIT`, or `CLOSED`. One source of truth, no double data entry.

**Design note on settings:** Telegram links, the BNB donation address,
branding, and the disclaimer all live in one **Site Settings** screen in the
admin dashboard, rather than three separate screens — same functionality,
fewer places to update when something changes.

---

## 6. Security checklist (already implemented)

- [x] No public registration/login — only one hardcoded admin email is ever accepted
- [x] Passwords hashed with bcrypt (never stored/compared in plaintext)
- [x] Sessions are signed JWTs in HTTP-only, `secure` (in production), `SameSite=Lax` cookies
- [x] Every admin-only API route re-checks the session server-side — not just relying on middleware
- [x] Login endpoint has rate limiting + lockout after repeated failures
- [x] File uploads validate MIME type and size, and generate random filenames (no path traversal)
- [x] Site settings updates use an explicit field whitelist, not raw `Object.assign`
- [x] Security headers set in `next.config.js` (X-Frame-Options, nosniff, etc.)
- [x] No secrets anywhere in frontend code or Git — all via environment variables

If you ever change `ADMIN_EMAIL`, all existing sessions are instantly
invalidated, since every request re-verifies the token's email against the
current environment variable.

---

## 7. Extending it

Each admin content screen (Forex, Crypto, Gems, Ads, Announcements) is a thin
wrapper around one shared component, `components/admin/AdminCrudManager.jsx`,
configured with a field list. To add a new field to, say, Forex Analysis:

1. Add it to `lib/models/ForexAnalysis.js`.
2. Add it to the `fields` array in `app/admin/dashboard/forex/page.jsx`.
3. (Optional) Display it on `app/forex/[id]/page.jsx` or `ForexCard.jsx`.

No other files need to change.
