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
  .then(() => {
    console.log('Connected to MongoDB Atlas');
    migrateLegacyTrades().catch(err => console.error('Legacy trade migration failed:', err.message));
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
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

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
  session: { type: String, default: 'London' },         // Session Tracking (London, New York, Asian)
  tags: { type: [String], default: [] },               // Strategy Tagging
  chartScreenshot: { type: String, default: null },    // Chart Screenshot Attachment
  exitReason: { type: String, default: null }, // 'Take Profit' | 'Stop Loss' | 'Manual'
  currentPrice: { type: Number, default: null },
  lastPriceUpdate: { type: Date, default: null },
  marketSymbol: { type: String, default: null }, // e.g. 'GBPUSD' if auto-monitored
  priceSource: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
  closedAt: { type: Date, default: null }
});
const Trade = mongoose.model('Trade', tradeSchema);

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
          user = await User.create({
            googleId: profile.id,
            email: email,
            username: profile.displayName || "Trader"
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
// AUTH ROUTES
// ============================================================
app.get('/api/current-user', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({ success: true, user: { id: req.user._id, username: req.user.username, email: req.user.email } });
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
    const newUser = await User.create({ username, email, password: hashedPassword });

    req.login(newUser, err => {
      if (err) return res.status(500).json({ success: false, message: err.message });
      res.json({ success: true, user: { id: newUser._id, username: newUser.username, email: newUser.email } });
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
      res.json({ success: true, user: { id: user._id, username: user.username, email: user.email } });
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

function computeRiskReward(direction, entry, sl, tp) {
  if (entry === undefined || sl === undefined || tp === undefined) return null;
  entry = parseFloat(entry); sl = parseFloat(sl); tp = parseFloat(tp);
  if (isNaN(entry) || isNaN(sl) || isNaN(tp)) return null;
  let risk, reward;
  if (direction === 'Buy') { risk = entry - sl; reward = tp - entry; }
  else { risk = sl - entry; reward = entry - tp; }
  if (risk <= 0 || reward <= 0) return null;
  return { risk, reward, ratio: reward / risk };
}

app.post('/api/analyze', requireAuth, async (req, res) => {
  let savedTrade;
  try {
    const { currencyPair, tradeDirection, entryPrice, exitPrice, stopLoss, takeProfit, tradeOutcome, tradeNotes, tags, chartScreenshot, session } = req.body;

    if (!currencyPair || !tradeDirection || !entryPrice) {
      return res.status(400).json({ success: false, message: 'Pair, direction, and entry price are required.' });
    }

    const key = normalizePairKey(currencyPair);

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
      closedAt: (tradeOutcome === 'Win' || tradeOutcome === 'Loss') ? new Date() : null
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
- ${rrLine}
- Trader's Thesis/Notes: "${savedTrade.notes || 'None provided'}"

Give a professional critique covering: logical consistency of market session timing, setup evaluation of strategy tags used, whether stop/target placement matches the thesis, potential weaknesses, and 2-3 concrete lessons. Be direct and concise.`;

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
    res.json({ success: true });
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
