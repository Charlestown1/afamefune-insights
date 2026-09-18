require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const session = require('express-session');

const app = express();
app.set('trust proxy', 1); // Fix Render proxy secure protocol detection
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
// SESSION & PASSPORT
// ============================================================
app.use(session({
  secret: process.env.SESSION_SECRET || 'forex_secret_key',
  resave: false,
  saveUninitialized: false,
  proxy: true,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000
  }
}));

app.use(passport.initialize());
app.use(passport.session());

// ============================================================
// MONGODB CONNECTION
// ============================================================
mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('Connected to MongoDB Atlas');
    await migrateLegacyTrades().catch(err => console.error('Legacy trade migration failed:', err.message));
    await ensureAdminUser().catch(err => console.error('Admin promotion check failed:', err.message));
  })
  .catch(err => console.error('MongoDB Connection Error:', err));

// ============================================================
// SCHEMAS & MODELS
// ============================================================
const userSchema = new mongoose.Schema({
  username: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String },
  googleId: { type: String, sparse: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' }, // NEW: admin system
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

const propFirmAccountSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  firmName: { type: String, default: '' },
  accountName: { type: String, required: true },
  accountSize: { type: Number, required: true },
  currency: { type: String, default: 'USD' },
  maxOverallDrawdownPct: { type: Number, default: 10 },
  maxDailyDrawdownPct: { type: Number, default: 5 },
  profitTargetPct: { type: Number, default: 10 },
  riskPerTradePct: { type: Number, default: null },
  phase: { type: String, default: 'Evaluation' }, // Evaluation | Verification | Funded
  status: { type: String, default: 'Active' },    // Active | Passed | Failed | Breached
  accountLabel: { type: String, default: null },  // optional non-sensitive label/number
  dailyResetHourUTC: { type: Number, default: 0 }, // configurable daily-drawdown reset boundary
  createdAt: { type: Date, default: Date.now },
  archivedAt: { type: Date, default: null }
});
const PropFirmAccount = mongoose.model('PropFirmAccount', propFirmAccountSchema);

const tradeSchema = new mongoose.Schema({
  // userId is the SOURCE OF TRUTH for ownership. username is kept only for display/back-compat.
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  username: { type: String, required: true },
  pair: String,
  direction: String, // 'Buy' | 'Sell'
  entry: Number,
  exit: Number,
  stopLoss: Number,
  takeProfit: Number,
  outcome: { type: String, default: 'Running' }, // 'Win' | 'Loss' | 'BreakEven' | 'Running'
  notes: String,
  session: { type: String, default: 'London' },
  tags: { type: [String], default: [] },
  chartScreenshot: { type: String, default: null },
  exitReason: { type: String, default: null }, // 'Take Profit' | 'Stop Loss' | 'Manual'
  currentPrice: { type: Number, default: null },
  lastPriceUpdate: { type: Date, default: null },
  marketSymbol: { type: String, default: null },
  priceSource: { type: String, default: null },
  // NEW: prop-firm integration fields — all optional/defaulted, fully backward compatible
  propFirmAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'PropFirmAccount', default: null },
  riskAmount: { type: Number, default: null },   // dollar amount risked on this trade
  realizedPL: { type: Number, default: null },   // dollar profit/loss result (actual, not risk)
  createdAt: { type: Date, default: Date.now },
  closedAt: { type: Date, default: null }
});
const Trade = mongoose.model('Trade', tradeSchema);

const advertisementSchema = new mongoose.Schema({
  title: { type: String, required: true },
  company: { type: String, default: '' },
  description: { type: String, default: '' },
  imageData: { type: String, default: null }, // base64 data URL, same pattern as chartScreenshot
  destinationUrl: { type: String, default: null },
  ctaText: { type: String, default: 'Learn More' },
  startDate: { type: Date, default: null },
  endDate: { type: Date, default: null },
  active: { type: Boolean, default: true },
  priority: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});
const Advertisement = mongoose.model('Advertisement', advertisementSchema);

// One-time safe migration: attach userId to legacy trades that only have `username`.
async function migrateLegacyTrades() {
  const legacy = await Trade.find({ userId: { $exists: false } });
  if (!legacy.length) return;
  console.log(`Migrating ${legacy.length} legacy trade(s) to secure userId-based storage...`);
  let migrated = 0;
  for (const t of legacy) {
    const owner = await User.findOne({ username: t.username });
    if (owner) {
      t.userId = owner._id;
      await t.save();
      migrated++;
    }
  }
  console.log(`Migration complete: ${migrated}/${legacy.length} trade(s) matched to an account.`);
}

// One-time / recurring safe promotion: if ADMIN_EMAIL env var matches an existing
// account, ensure that account has the admin role. Never promotes anyone else.
async function ensureAdminUser() {
  if (!process.env.ADMIN_EMAIL) return;
  const email = process.env.ADMIN_EMAIL.toLowerCase();
  const user = await User.findOne({ email });
  if (user && user.role !== 'admin') {
    user.role = 'admin';
    await user.save();
    console.log(`Promoted ${email} to admin (via ADMIN_EMAIL).`);
  }
}

// ============================================================
// GOOGLE GENERATIVE AI
// ============================================================
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ============================================================
// PASSPORT GOOGLE STRATEGY
// ============================================================
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "https://afamefune-insights.onrender.com/auth/google/callback"
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
      if (!email) {
        return done(new Error("No email associated with this Google account."));
      }

      let user = await User.findOne({ googleId: profile.id });
      if (!user) {
        user = await User.findOne({ email: email });
        if (user) {
          user.googleId = profile.id;
          user.username = user.username || profile.displayName || "Trader";
          await user.save();
        } else {
          const role = (process.env.ADMIN_EMAIL && email.toLowerCase() === process.env.ADMIN_EMAIL.toLowerCase()) ? 'admin' : 'user';
          user = await User.create({
            googleId: profile.id,
            email: email,
            username: profile.displayName || "Trader",
            role
          });
        }
      }
      return done(null, user);
    } catch (err) {
      console.error("Google Strategy DB Error:", err);
      return done(err, null);
    }
  }
));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

// ============================================================
// AUTH MIDDLEWARE
// ============================================================
function requireAuth(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  return res.status(401).json({ success: false, message: 'Not authenticated' });
}

// Real server-side authorization for admin routes. A user cannot reach these
// by editing frontend JS, calling the API directly, or forging a variable —
// req.user.role is read from the authenticated session's DB record only.
function requireAdmin(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated() && req.user && req.user.role === 'admin') {
    return next();
  }
  return res.status(403).json({ success: false, message: 'Admin access required' });
}

// ============================================================
// SHARED CALCULATION UTILITIES
// ============================================================
function computeRiskReward(direction, entry, sl, tp) {
  if (entry === undefined || sl === undefined || tp === undefined || entry === null || sl === null || tp === null) return null;
  entry = parseFloat(entry); sl = parseFloat(sl); tp = parseFloat(tp);
  if (isNaN(entry) || isNaN(sl) || isNaN(tp)) return null;
  let risk, reward;
  if (direction === 'Buy') { risk = entry - sl; reward = tp - entry; }
  else { risk = sl - entry; reward = entry - tp; }
  if (risk <= 0 || reward <= 0) return null;
  return { risk, reward, ratio: reward / risk };
}

function sanitizeText(str, maxLen) {
  if (!str) return '';
  return String(str).replace(/[<>]/g, '').slice(0, maxLen || 300);
}

function isValidHttpUrl(str) {
  if (!str) return true; // optional field
  try {
    const u = new URL(str);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function isValidImageDataUrl(str) {
  if (!str) return true; // optional field
  if (typeof str !== 'string') return false;
  const match = /^data:image\/(png|jpe?g|webp);base64,/i.exec(str);
  if (!match) return false;
  const approxBytes = (str.length * 3) / 4;
  return approxBytes <= 4 * 1024 * 1024; // 4MB cap, matches request body limit headroom
}

// ============================================================
// PROP FIRM STATS COMPUTATION (single source of truth — always
// derived live from trades, never a stored/mutated balance, so
// Delete All / edits can never leave stale drawdown numbers)
// ============================================================
const DRAWDOWN_THRESHOLDS = { caution: 70, warning: 80, critical: 90, breached: 100 };

function computePropFirmStats(account, allUserTrades) {
  const accountId = String(account._id);
  const accountTrades = allUserTrades.filter(t => t.propFirmAccountId && String(t.propFirmAccountId) === accountId);
  const closedTrades = accountTrades.filter(t => t.outcome === 'Win' || t.outcome === 'Loss' || t.outcome === 'BreakEven');
  const runningTrades = accountTrades.filter(t => t.outcome === 'Running');

  const startingBalance = account.accountSize;
  const maxDrawdownDollars = startingBalance * (account.maxOverallDrawdownPct / 100);
  const maxDailyDrawdownDollars = startingBalance * (account.maxDailyDrawdownPct / 100);
  const profitTargetDollars = startingBalance * (account.profitTargetPct / 100);

  // Build equity curve chronologically to compute peak-to-trough (trailing) drawdown,
  // the methodology most funded-account prop firms use. (Some firms instead use a
  // "static" drawdown measured only from the initial balance — if your firm uses
  // that model instead, treat "Remaining Drawdown" here as the more conservative figure.)
  const sortedClosed = [...closedTrades].sort((a, b) => new Date(a.closedAt || a.createdAt) - new Date(b.closedAt || b.createdAt));
  let runningBalance = startingBalance;
  let peakBalance = startingBalance;
  const balanceCurve = [{ date: account.createdAt, balance: startingBalance, label: 'Start' }];
  for (const t of sortedClosed) {
    runningBalance += (Number(t.realizedPL) || 0);
    if (runningBalance > peakBalance) peakBalance = runningBalance;
    balanceCurve.push({ date: t.closedAt || t.createdAt, balance: runningBalance, pair: t.pair, pl: Number(t.realizedPL) || 0 });
  }
  const currentBalance = runningBalance;
  const drawdownUsedDollars = Math.max(0, peakBalance - currentBalance);
  const drawdownUsedPct = maxDrawdownDollars > 0 ? (drawdownUsedDollars / maxDrawdownDollars) * 100 : 0;
  const remainingDrawdownDollars = Math.max(0, maxDrawdownDollars - drawdownUsedDollars);

  // Daily drawdown: net P/L for trades closed since the account's configured daily reset hour (UTC)
  const now = new Date();
  const resetHour = account.dailyResetHourUTC || 0;
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), resetHour, 0, 0));
  if (dayStart > now) dayStart.setUTCDate(dayStart.getUTCDate() - 1);
  const todaysTrades = sortedClosed.filter(t => new Date(t.closedAt || t.createdAt) >= dayStart);
  const todaysPL = todaysTrades.reduce((s, t) => s + (Number(t.realizedPL) || 0), 0);
  const dailyDrawdownUsedDollars = Math.max(0, -todaysPL);
  const dailyDrawdownUsedPct = maxDailyDrawdownDollars > 0 ? (dailyDrawdownUsedDollars / maxDailyDrawdownDollars) * 100 : 0;
  const remainingDailyDrawdownDollars = Math.max(0, maxDailyDrawdownDollars - dailyDrawdownUsedDollars);

  const profit = currentBalance - startingBalance;
  const profitTargetProgressPct = profitTargetDollars > 0 ? Math.max(0, (profit / profitTargetDollars) * 100) : 0;
  const distanceToTargetDollars = Math.max(0, profitTargetDollars - profit);

  const openRiskDollars = runningTrades.reduce((s, t) => s + (Number(t.riskAmount) || 0), 0);

  const wins = closedTrades.filter(t => t.outcome === 'Win').length;
  const losses = closedTrades.filter(t => t.outcome === 'Loss').length;
  const decided = wins + losses;
  const winRate = decided > 0 ? (wins / decided) * 100 : 0;
  const grossWinDollars = closedTrades.filter(t => t.outcome === 'Win').reduce((s, t) => s + (Number(t.realizedPL) || 0), 0);
  const grossLossDollars = Math.abs(closedTrades.filter(t => t.outcome === 'Loss').reduce((s, t) => s + (Number(t.realizedPL) || 0), 0));
  const largestWin = closedTrades.reduce((m, t) => (t.outcome === 'Win' ? Math.max(m, Number(t.realizedPL) || 0) : m), 0);
  const largestLoss = closedTrades.reduce((m, t) => (t.outcome === 'Loss' ? Math.min(m, Number(t.realizedPL) || 0) : m), 0);
  const avgRisk = closedTrades.length ? closedTrades.reduce((s, t) => s + (Number(t.riskAmount) || 0), 0) / closedTrades.length : 0;

  const worstPct = Math.max(drawdownUsedPct, dailyDrawdownUsedPct);
  let status = 'Safe';
  if (worstPct >= DRAWDOWN_THRESHOLDS.breached) status = 'Breached';
  else if (worstPct >= DRAWDOWN_THRESHOLDS.critical) status = 'Critical';
  else if (worstPct >= DRAWDOWN_THRESHOLDS.warning) status = 'Warning';
  else if (worstPct >= DRAWDOWN_THRESHOLDS.caution) status = 'Caution';

  return {
    startingBalance, currentBalance, profit, profitTargetDollars, profitTargetProgressPct, distanceToTargetDollars,
    maxDrawdownDollars, drawdownUsedDollars, drawdownUsedPct, remainingDrawdownDollars,
    maxDailyDrawdownDollars, dailyDrawdownUsedDollars, dailyDrawdownUsedPct, remainingDailyDrawdownDollars,
    openRiskDollars, totalTrades: accountTrades.length, closedTrades: closedTrades.length, runningTrades: runningTrades.length,
    wins, losses, winRate, grossWinDollars, grossLossDollars, largestWin, largestLoss, avgRisk,
    peakBalance, status, balanceCurve
  };
}

// ============================================================
// LIVE MARKET DATA SERVICE (Twelve Data)
// ============================================================
const TRACKED_SYMBOLS = {
  GBPUSD: { td: 'GBP/USD', label: 'GBPUSD' },
  USDCAD: { td: 'USD/CAD', label: 'USDCAD' },
  XAUUSD: { td: 'XAU/USD', label: 'GOLD' },
  BTCUSD: { td: 'BTC/USD', label: 'BTCUSD' },
  USDJPY: { td: 'USD/JPY', label: 'USDJPY' }
};

const marketCache = {};
let marketFailCount = 0;
const POLL_INTERVAL_MS = parseInt(process.env.MARKET_POLL_INTERVAL_MS, 10) || 300000;

function normalizePairKey(raw) {
  if (!raw) return null;
  let k = String(raw).toUpperCase().replace(/[^A-Z]/g, '');
  if (k === 'GOLD' || k === 'XAU') k = 'XAUUSD';
  if (k === 'BTC') k = 'BTCUSD';
  return TRACKED_SYMBOLS[k] ? k : null;
}

async function fetchMarketData() {
  if (!process.env.TWELVE_DATA_API_KEY) {
    for (const key of Object.keys(TRACKED_SYMBOLS)) {
      marketCache[key] = marketCache[key] || { symbol: TRACKED_SYMBOLS[key].label, price: null, change: null, percentChange: null, updatedAt: null, status: 'offline' };
    }
    return;
  }

  const symbolsParam = Object.values(TRACKED_SYMBOLS).map(s => s.td).join(',');
  const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbolsParam)}&apikey=${process.env.TWELVE_DATA_API_KEY}`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    const entries = data.symbol ? { [data.symbol]: data } : data;

    let anySuccess = false;
    for (const [key, sym] of Object.entries(TRACKED_SYMBOLS)) {
      const q = entries[sym.td];
      if (q && q.status !== 'error' && q.close !== undefined) {
        marketCache[key] = {
          symbol: sym.label,
          price: parseFloat(q.close),
          change: q.change !== undefined ? parseFloat(q.change) : null,
          percentChange: q.percent_change !== undefined ? parseFloat(q.percent_change) : null,
          updatedAt: new Date(),
          status: 'live'
        };
        anySuccess = true;
      } else if (marketCache[key]) {
        marketCache[key].status = 'stale';
      }
    }

    if (anySuccess) {
      marketFailCount = 0;
    } else {
      marketFailCount++;
      console.error('Market data: no symbols returned successfully.', data.message || '');
    }
  } catch (err) {
    marketFailCount++;
    console.error('Market data fetch failed:', err.message);
    for (const key of Object.keys(TRACKED_SYMBOLS)) {
      if (marketCache[key]) marketCache[key].status = marketFailCount >= 3 ? 'offline' : 'stale';
    }
  }

  await monitorRunningTrades();
}

// Server-side TP/SL monitoring. Runs independently of any open browser tab.
async function monitorRunningTrades() {
  try {
    const runningTrades = await Trade.find({ outcome: 'Running' });
    for (const trade of runningTrades) {
      const key = normalizePairKey(trade.pair);
      if (!key || !marketCache[key] || marketCache[key].price === null) continue;

      const current = marketCache[key].price;
      trade.currentPrice = current;
      trade.lastPriceUpdate = new Date();
      trade.marketSymbol = key;
      trade.priceSource = 'Twelve Data';

      const sl = trade.stopLoss;
      const tp = trade.takeProfit;
      const dir = trade.direction;

      let hitOutcome = null;
      let hitReason = null;

      if (dir === 'Buy') {
        if (tp !== undefined && tp !== null && current >= tp) { hitOutcome = 'Win'; hitReason = 'Take Profit'; }
        else if (sl !== undefined && sl !== null && current <= sl) { hitOutcome = 'Loss'; hitReason = 'Stop Loss'; }
      } else if (dir === 'Sell') {
        if (tp !== undefined && tp !== null && current <= tp) { hitOutcome = 'Win'; hitReason = 'Take Profit'; }
        else if (sl !== undefined && sl !== null && current >= sl) { hitOutcome = 'Loss'; hitReason = 'Stop Loss'; }
      }

      if (hitOutcome) {
        trade.outcome = hitOutcome;
        trade.exit = current;
        trade.exitReason = hitReason;
        trade.closedAt = new Date();

        // If this trade is linked to a prop-firm account with a risk amount but no
        // manually-entered P/L yet, estimate realized P/L using the R-multiple method:
        // Win = risk × (planned reward/risk ratio), Loss = -risk. This assumes static
        // position sizing; a manually entered realizedPL always takes precedence.
        if (trade.propFirmAccountId && trade.riskAmount && (trade.realizedPL === null || trade.realizedPL === undefined)) {
          if (hitOutcome === 'Win') {
            const rr = computeRiskReward(trade.direction, trade.entry, trade.stopLoss, trade.takeProfit);
            trade.realizedPL = rr ? trade.riskAmount * rr.ratio : trade.riskAmount;
          } else {
            trade.realizedPL = -trade.riskAmount;
          }
        }
      }

      await trade.save();
    }
  } catch (err) {
    console.error('monitorRunningTrades error:', err.message);
  }
}

fetchMarketData();
setInterval(fetchMarketData, POLL_INTERVAL_MS);

app.get('/api/market', (req, res) => {
  res.json({
    success: true,
    pollIntervalMs: POLL_INTERVAL_MS,
    configured: !!process.env.TWELVE_DATA_API_KEY,
    data: marketCache
  });
});

// ============================================================
// PAGE ROUTE
// ============================================================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================================
// ANDROID TWA — DIGITAL ASSET LINKS
// ============================================================
// Required for the Android app (built via Bubblewrap/Trusted Web Activity)
// to open without a browser URL bar. Verification only succeeds once
// ANDROID_APK_SHA256_FINGERPRINT is set to the real SHA-256 fingerprint of
// your app's signing key (see android-twa/README-ANDROID.md for the exact
// `keytool` command to get it). Until then this safely returns an empty
// list — the site keeps working normally in a browser either way.
app.get('/.well-known/assetlinks.json', (req, res) => {
  const fingerprint = process.env.ANDROID_APK_SHA256_FINGERPRINT;
  if (!fingerprint) return res.json([]);
  res.json([{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: 'com.afamefune.insights',
      sha256_cert_fingerprints: [fingerprint]
    }
  }]);
});

// ============================================================
// AUTH ROUTES
// ============================================================
app.get('/api/current-user', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({ success: true, user: { id: req.user._id, username: req.user.username, email: req.user.email, role: req.user.role || 'user' } });
  } else {
    res.json({ success: false });
  }
});

app.post('/api/signup', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.json({ success: false, message: 'All fields are required' });
    }
    const existing = await User.findOne({ email });
    if (existing) return res.json({ success: false, message: 'Email already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const role = (process.env.ADMIN_EMAIL && email.toLowerCase() === process.env.ADMIN_EMAIL.toLowerCase()) ? 'admin' : 'user';
    const newUser = await User.create({ username, email, password: hashedPassword, role });

    req.login(newUser, err => {
      if (err) return res.status(500).json({ success: false, message: err.message });
      res.json({ success: true, user: { id: newUser._id, username: newUser.username, email: newUser.email, role: newUser.role } });
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !user.password) return res.json({ success: false, message: 'User not found or uses Google login' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.json({ success: false, message: 'Invalid credentials' });

    req.login(user, err => {
      if (err) return res.status(500).json({ success: false, message: err.message });
      res.json({ success: true, user: { id: user._id, username: user.username, email: user.email, role: user.role || 'user' } });
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/auth/logout', (req, res) => {
  req.logout(() => {
    res.redirect('/');
  });
});

app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => {
    res.redirect('/');
  }
);

// ============================================================
// TRADE ROUTES
// ============================================================
app.get('/api/trades', requireAuth, async (req, res) => {
  try {
    const trades = await Trade.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json({ success: true, trades });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/analyze', requireAuth, async (req, res) => {
  let savedTrade;
  try {
    const {
      currencyPair, tradeDirection, entryPrice, exitPrice, stopLoss, takeProfit,
      tradeOutcome, tradeNotes, tags, chartScreenshot, session,
      propFirmAccountId, riskAmount, realizedPL
    } = req.body;

    if (!currencyPair || !tradeDirection || !entryPrice) {
      return res.status(400).json({ success: false, message: 'Pair, direction, and entry price are required.' });
    }

    const key = normalizePairKey(currencyPair);

    // Security: only allow linking to a prop-firm account that actually belongs
    // to the authenticated user — never trust an id supplied by the client blindly.
    let validAccountId = null;
    if (propFirmAccountId) {
      const owned = await PropFirmAccount.findOne({ _id: propFirmAccountId, userId: req.user._id });
      if (owned) validAccountId = owned._id;
    }

    savedTrade = await Trade.create({
      userId: req.user._id,
      username: req.user.username,
      pair: currencyPair,
      direction: tradeDirection,
      entry: entryPrice !== '' ? parseFloat(entryPrice) : undefined,
      exit: exitPrice !== '' && exitPrice !== undefined ? parseFloat(exitPrice) : undefined,
      stopLoss: stopLoss !== '' && stopLoss !== undefined ? parseFloat(stopLoss) : undefined,
      takeProfit: takeProfit !== '' && takeProfit !== undefined ? parseFloat(takeProfit) : undefined,
      outcome: tradeOutcome || 'Running',
      notes: tradeNotes,
      session: session || 'London',
      tags: Array.isArray(tags) ? tags : [],
      chartScreenshot: chartScreenshot || null,
      exitReason: tradeOutcome === 'Win' || tradeOutcome === 'Loss' ? 'Manual' : null,
      marketSymbol: key,
      priceSource: key ? 'Twelve Data' : null,
      propFirmAccountId: validAccountId,
      riskAmount: (riskAmount !== '' && riskAmount !== undefined && riskAmount !== null) ? parseFloat(riskAmount) : null,
      realizedPL: (realizedPL !== '' && realizedPL !== undefined && realizedPL !== null) ? parseFloat(realizedPL) : null,
      closedAt: (tradeOutcome === 'Win' || tradeOutcome === 'Loss' || tradeOutcome === 'BreakEven') ? new Date() : null
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Could not save trade: ' + err.message });
  }

  try {
    const rr = computeRiskReward(savedTrade.direction, savedTrade.entry, savedTrade.stopLoss, savedTrade.takeProfit);
    const rrLine = rr
      ? `Risk: ${rr.risk.toFixed(5)} | Potential reward: ${rr.reward.toFixed(5)} | Approximate R:R = 1:${rr.ratio.toFixed(2)}`
      : 'Risk/reward could not be calculated (missing stop loss or take profit).';

    const tagsLine = savedTrade.tags && savedTrade.tags.length > 0 ? savedTrade.tags.join(', ') : 'None';
    const sessionLine = savedTrade.session || 'London';
    const riskLine = savedTrade.riskAmount ? `$${savedTrade.riskAmount}` : 'Not specified';
    const plLine = savedTrade.realizedPL !== null && savedTrade.realizedPL !== undefined ? `$${savedTrade.realizedPL}` : 'Not specified / still open';

    const prompt = `You are an elite forex/crypto trading mentor. Analyze this trade using ONLY the information given — do not invent details.

- Pair: ${savedTrade.pair}
- Direction: ${savedTrade.direction}
- Trading Session: ${sessionLine}
- Entry Price: ${savedTrade.entry ?? 'Not provided'}
- Exit Price: ${savedTrade.exit ?? 'Active / not yet closed'}
- Stop Loss: ${savedTrade.stopLoss ?? 'Not set'}
- Take Profit: ${savedTrade.takeProfit ?? 'Not set'}
- Outcome: ${savedTrade.outcome}
- Strategy Tags: ${tagsLine}
- Amount Risked: ${riskLine}
- Realized P/L: ${plLine}
- ${rrLine}
- Trader's Thesis/Notes: "${savedTrade.notes || 'None provided'}"

Give a professional critique covering: logical consistency of market session timing, setup evaluation of strategy tags used, whether stop/target placement matches the thesis, risk management quality given the amount risked, potential weaknesses, and 2-3 concrete lessons. Be direct and concise.`;

    const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    res.json({ success: true, text: response.text(), trade: savedTrade });
  } catch (error) {
    console.error('Gemini Analyze Error:', error.message);
    res.json({
      success: true,
      text: 'Trade saved successfully. The AI mentor is temporarily unavailable, so no analysis could be generated this time.',
      trade: savedTrade
    });
  }
});

app.post('/api/reset', requireAuth, async (req, res) => {
  try {
    await Trade.deleteMany({ userId: req.user._id });
    // Prop-firm accounts are configuration, not trade data — they are preserved.
    // Their balances/drawdown are always derived live from trades, so they
    // automatically and correctly return to zero-activity state.
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================
// PROP FIRM ACCOUNT ROUTES
// ============================================================
app.get('/api/propfirm/accounts', requireAuth, async (req, res) => {
  try {
    const accounts = await PropFirmAccount.find({ userId: req.user._id, archivedAt: null }).sort({ createdAt: 1 });
    const allTrades = await Trade.find({ userId: req.user._id });
    const withStats = accounts.map(acc => ({
      ...acc.toObject(),
      stats: computePropFirmStats(acc, allTrades)
    }));
    res.json({ success: true, accounts: withStats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/propfirm/accounts', requireAuth, async (req, res) => {
  try {
    const { firmName, accountName, accountSize, currency, maxOverallDrawdownPct, maxDailyDrawdownPct, profitTargetPct, riskPerTradePct, phase, accountLabel, dailyResetHourUTC } = req.body;
    if (!accountName || !accountSize || isNaN(parseFloat(accountSize)) || parseFloat(accountSize) <= 0) {
      return res.status(400).json({ success: false, message: 'Account name and a valid account size are required.' });
    }
    const account = await PropFirmAccount.create({
      userId: req.user._id,
      firmName: sanitizeText(firmName, 80),
      accountName: sanitizeText(accountName, 80),
      accountSize: parseFloat(accountSize),
      currency: currency || 'USD',
      maxOverallDrawdownPct: maxOverallDrawdownPct !== undefined && maxOverallDrawdownPct !== '' ? parseFloat(maxOverallDrawdownPct) : 10,
      maxDailyDrawdownPct: maxDailyDrawdownPct !== undefined && maxDailyDrawdownPct !== '' ? parseFloat(maxDailyDrawdownPct) : 5,
      profitTargetPct: profitTargetPct !== undefined && profitTargetPct !== '' ? parseFloat(profitTargetPct) : 10,
      riskPerTradePct: riskPerTradePct !== undefined && riskPerTradePct !== '' ? parseFloat(riskPerTradePct) : null,
      phase: phase || 'Evaluation',
      accountLabel: accountLabel ? sanitizeText(accountLabel, 60) : null,
      dailyResetHourUTC: (dailyResetHourUTC !== undefined && dailyResetHourUTC !== '') ? Math.min(23, Math.max(0, parseInt(dailyResetHourUTC, 10))) : 0
    });
    res.json({ success: true, account });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put('/api/propfirm/accounts/:id', requireAuth, async (req, res) => {
  try {
    const account = await PropFirmAccount.findOne({ _id: req.params.id, userId: req.user._id });
    if (!account) return res.status(404).json({ success: false, message: 'Account not found' });

    const fields = ['firmName', 'accountName', 'currency', 'phase', 'status', 'accountLabel'];
    fields.forEach(f => { if (req.body[f] !== undefined) account[f] = sanitizeText(req.body[f], 100); });

    const numFields = ['accountSize', 'maxOverallDrawdownPct', 'maxDailyDrawdownPct', 'profitTargetPct', 'riskPerTradePct', 'dailyResetHourUTC'];
    numFields.forEach(f => {
      if (req.body[f] !== undefined && req.body[f] !== '') {
        const n = parseFloat(req.body[f]);
        if (!isNaN(n)) account[f] = n;
      }
    });

    await account.save();
    res.json({ success: true, account });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/propfirm/accounts/:id', requireAuth, async (req, res) => {
  try {
    const account = await PropFirmAccount.findOne({ _id: req.params.id, userId: req.user._id });
    if (!account) return res.status(404).json({ success: false, message: 'Account not found' });

    // Unlink (never delete) trades that reference this account.
    await Trade.updateMany({ propFirmAccountId: account._id, userId: req.user._id }, { $set: { propFirmAccountId: null } });
    await PropFirmAccount.deleteOne({ _id: account._id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================
// DONATION INFO (public, non-sensitive)
// ============================================================
const DEFAULT_DONATION_ADDRESS = '0x1B7f1D6AFa15979C40564e7cc66084082c7483C1';
app.get('/api/donation', (req, res) => {
  res.json({
    success: true,
    address: process.env.DONATION_BSC_ADDRESS || DEFAULT_DONATION_ADDRESS,
    network: 'BNB Smart Chain (BEP-20)'
  });
});

// ============================================================
// ADVERTISEMENTS (public read of active ads; admin-only writes)
// ============================================================
app.get('/api/ads', requireAuth, async (req, res) => {
  try {
    const now = new Date();
    const ads = await Advertisement.find({
      active: true,
      $and: [
        { $or: [{ startDate: null }, { startDate: { $lte: now } }] },
        { $or: [{ endDate: null }, { endDate: { $gte: now } }] }
      ]
    }).sort({ priority: -1, createdAt: -1 }).limit(10);
    res.json({ success: true, ads });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/admin/ads', requireAuth, requireAdmin, async (req, res) => {
  try {
    const ads = await Advertisement.find({}).sort({ priority: -1, createdAt: -1 });
    res.json({ success: true, ads });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/admin/ads', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { title, company, description, imageData, destinationUrl, ctaText, startDate, endDate, active, priority } = req.body;
    if (!title) return res.status(400).json({ success: false, message: 'Title is required.' });
    if (!isValidHttpUrl(destinationUrl)) return res.status(400).json({ success: false, message: 'Destination URL must be a valid http(s) link.' });
    if (!isValidImageDataUrl(imageData)) return res.status(400).json({ success: false, message: 'Image must be a JPG/PNG/WebP under 4MB.' });

    const ad = await Advertisement.create({
      title: sanitizeText(title, 100),
      company: sanitizeText(company, 100),
      description: sanitizeText(description, 500),
      imageData: imageData || null,
      destinationUrl: destinationUrl || null,
      ctaText: sanitizeText(ctaText, 40) || 'Learn More',
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      active: active !== undefined ? !!active : true,
      priority: priority !== undefined && priority !== '' ? parseInt(priority, 10) : 0
    });
    res.json({ success: true, ad });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put('/api/admin/ads/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const ad = await Advertisement.findById(req.params.id);
    if (!ad) return res.status(404).json({ success: false, message: 'Advertisement not found' });

    const { title, company, description, imageData, destinationUrl, ctaText, startDate, endDate, active, priority } = req.body;
    if (destinationUrl !== undefined && !isValidHttpUrl(destinationUrl)) return res.status(400).json({ success: false, message: 'Destination URL must be a valid http(s) link.' });
    if (imageData !== undefined && !isValidImageDataUrl(imageData)) return res.status(400).json({ success: false, message: 'Image must be a JPG/PNG/WebP under 4MB.' });

    if (title !== undefined) ad.title = sanitizeText(title, 100);
    if (company !== undefined) ad.company = sanitizeText(company, 100);
    if (description !== undefined) ad.description = sanitizeText(description, 500);
    if (imageData !== undefined) ad.imageData = imageData || null;
    if (destinationUrl !== undefined) ad.destinationUrl = destinationUrl || null;
    if (ctaText !== undefined) ad.ctaText = sanitizeText(ctaText, 40) || 'Learn More';
    if (startDate !== undefined) ad.startDate = startDate ? new Date(startDate) : null;
    if (endDate !== undefined) ad.endDate = endDate ? new Date(endDate) : null;
    if (active !== undefined) ad.active = !!active;
    if (priority !== undefined && priority !== '') ad.priority = parseInt(priority, 10);

    await ad.save();
    res.json({ success: true, ad });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/admin/ads/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await Advertisement.deleteOne({ _id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================
// ADMIN DASHBOARD ROUTES
// ============================================================
app.get('/api/admin/overview', requireAuth, requireAdmin, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments({});
    const totalTrades = await Trade.countDocuments({});
    const wins = await Trade.countDocuments({ outcome: 'Win' });
    const losses = await Trade.countDocuments({ outcome: 'Loss' });
    const breakevens = await Trade.countDocuments({ outcome: 'BreakEven' });
    const running = await Trade.countDocuments({ outcome: 'Running' });
    const decided = wins + losses;
    const winRate = decided > 0 ? +(wins / decided * 100).toFixed(1) : 0;

    const pairAgg = await Trade.aggregate([
      { $group: { _id: '$pair', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 1 }
    ]);
    const userAgg = await Trade.aggregate([
      { $group: { _id: '$userId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 1 }
    ]);
    let mostActiveUser = null;
    if (userAgg[0] && userAgg[0]._id) {
      const u = await User.findById(userAgg[0]._id);
      mostActiveUser = u ? { username: u.username, trades: userAgg[0].count } : null;
    }

    const riskAgg = await Trade.aggregate([
      { $match: { riskAmount: { $ne: null } } },
      { $group: { _id: null, avgRisk: { $avg: '$riskAmount' } } }
    ]);
    const plAgg = await Trade.aggregate([
      { $match: { realizedPL: { $ne: null } } },
      { $group: { _id: null, totalPL: { $sum: '$realizedPL' } } }
    ]);

    const activeAds = await Advertisement.countDocuments({ active: true });
    const startOfDayUTC = new Date(); startOfDayUTC.setUTCHours(0, 0, 0, 0);
    const tradesToday = await Trade.countDocuments({ createdAt: { $gte: startOfDayUTC } });
    const usersToday = await User.countDocuments({ createdAt: { $gte: startOfDayUTC } });

    res.json({
      success: true,
      overview: {
        totalUsers, totalTrades, winRate, wins, losses, breakevens, running,
        mostTradedPair: pairAgg[0] ? pairAgg[0]._id : null,
        mostActiveUser,
        avgRisk: riskAgg[0] ? +riskAgg[0].avgRisk.toFixed(2) : 0,
        totalPL: plAgg[0] ? +plAgg[0].totalPL.toFixed(2) : 0,
        activeAds, tradesToday, usersToday
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const users = await User.find({}, '-password').lean();
    const stats = await Trade.aggregate([
      { $group: { _id: '$userId', total: { $sum: 1 }, wins: { $sum: { $cond: [{ $eq: ['$outcome', 'Win'] }, 1, 0] } }, losses: { $sum: { $cond: [{ $eq: ['$outcome', 'Loss'] }, 1, 0] } } } }
    ]);
    const statMap = {};
    stats.forEach(s => { statMap[String(s._id)] = s; });

    const result = users.map(u => {
      const s = statMap[String(u._id)] || { total: 0, wins: 0, losses: 0 };
      const decided = s.wins + s.losses;
      return {
        id: u._id,
        username: u.username,
        email: u.email,
        role: u.role || 'user',
        createdAt: u.createdAt,
        hasGoogleAuth: !!u.googleId,
        totalTrades: s.total,
        wins: s.wins,
        losses: s.losses,
        winRate: decided > 0 ? +(s.wins / decided * 100).toFixed(1) : 0
      };
    });
    res.json({ success: true, users: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/admin/trades', requireAuth, requireAdmin, async (req, res) => {
  try {
    const filter = {};
    if (req.query.username) filter.username = new RegExp(req.query.username, 'i');
    if (req.query.pair) filter.pair = new RegExp(req.query.pair, 'i');
    if (req.query.direction && req.query.direction !== 'All') filter.direction = req.query.direction;
    if (req.query.outcome && req.query.outcome !== 'All') filter.outcome = req.query.outcome;
    if (req.query.propFirmOnly === 'true') filter.propFirmAccountId = { $ne: null };
    if (req.query.from || req.query.to) {
      filter.createdAt = {};
      if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
      if (req.query.to) filter.createdAt.$lte = new Date(req.query.to);
    }
    const trades = await Trade.find(filter).sort({ createdAt: -1 }).limit(500);
    res.json({ success: true, trades });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/admin/users/:id/performance', requireAuth, requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id, '-password');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const trades = await Trade.find({ userId: user._id }).sort({ createdAt: -1 });
    const wins = trades.filter(t => t.outcome === 'Win').length;
    const losses = trades.filter(t => t.outcome === 'Loss').length;
    const breakevens = trades.filter(t => t.outcome === 'BreakEven').length;
    const decided = wins + losses;
    const winRate = decided > 0 ? +(wins / decided * 100).toFixed(1) : 0;
    const risks = trades.filter(t => t.riskAmount !== null && t.riskAmount !== undefined);
    const avgRisk = risks.length ? +(risks.reduce((s, t) => s + t.riskAmount, 0) / risks.length).toFixed(2) : 0;
    const pls = trades.filter(t => t.realizedPL !== null && t.realizedPL !== undefined);
    const totalPL = +(pls.reduce((s, t) => s + t.realizedPL, 0)).toFixed(2);

    res.json({
      success: true,
      user: { id: user._id, username: user.username, email: user.email, role: user.role || 'user', createdAt: user.createdAt },
      performance: { totalTrades: trades.length, wins, losses, breakevens, winRate, avgRisk, totalPL },
      trades
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================
// GLOBAL ERROR HANDLING
// ============================================================
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
