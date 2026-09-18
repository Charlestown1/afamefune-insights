let currentUser = null;
let allTrades = [];
let propFirmAccounts = [];
let selectedPropFirmAccountId = null;

let marketPollTimer = null;
let tradesPollTimer = null;
let sessionPollTimer = null;
let extendedMarketPollTimer = null;
let economicCalendarPollTimer = null;
let latestEconomicEvents = [];
let latestMarket = {};
let latestExtendedMarket = {};

let currentSearchQuery = '';
let currentOutcomeFilter = 'All';
let currentSessionFilter = 'All';

let adminSection = 'overview';
let adminUsersCache = [];
let adminTradesCache = [];
let adminAdsCache = [];

const TRACKED = ['GBPUSD', 'USDCAD', 'XAUUSD', 'BTCUSD', 'USDJPY'];

// ---------- SAFE EVENT BINDING ON LOAD ----------
// Each setup step is isolated so a failure in one can never block auth from
// resolving and revealing a screen to the user (the root cause of the earlier
// blank-screen bug was a single script parse failure taking everything down).
document.addEventListener('DOMContentLoaded', () => {
  try { setupTabs(); } catch (e) { console.error('setupTabs failed:', e); }
  try { setupForms(); } catch (e) { console.error('setupForms failed:', e); }
  try { setupScreenshotHandler(); } catch (e) { console.error('setupScreenshotHandler failed:', e); }
  try { setupAdImageHandler(); } catch (e) { console.error('setupAdImageHandler failed:', e); }

  const failsafeTimer = setTimeout(() => {
    const auth = document.getElementById('auth-screen');
    const shell = document.getElementById('app-shell');
    const authHidden = auth && auth.classList.contains('hidden');
    const shellHidden = shell && shell.classList.contains('hidden');
    if (authHidden && shellHidden) {
      console.warn('Failsafe triggered: forcing login screen visible.');
      if (auth) auth.classList.remove('hidden');
    }
  }, 12000);

  checkAuth().finally(() => clearTimeout(failsafeTimer));
});

function setupTabs() {
  const loginTabBtn = document.getElementById('tab-login-btn');
  const signupTabBtn = document.getElementById('tab-signup-btn');
  if (loginTabBtn) loginTabBtn.addEventListener('click', () => switchTab('login'));
  if (signupTabBtn) signupTabBtn.addEventListener('click', () => switchTab('signup'));
}

// IMPORTANT FIX: the HTML forms previously had BOTH an inline onsubmit="..."
// attribute AND this addEventListener binding, so every submit fired twice
// (e.g. every trade was saved to MongoDB twice). This is now the ONLY binding —
// the inline onsubmit attributes have been removed from index.html to match.
function setupForms() {
  const loginForm = document.getElementById('login-form');
  if (loginForm) loginForm.addEventListener('submit', handleLogin);

  const signupForm = document.getElementById('signup-form');
  if (signupForm) signupForm.addEventListener('submit', handleSignup);

  const tradeForm = document.getElementById('trade-form');
  if (tradeForm) tradeForm.addEventListener('submit', submitTrade);

  const quickTradeForm = document.getElementById('quick-trade-form');
  if (quickTradeForm) quickTradeForm.addEventListener('submit', (e) => submitTrade(e, true));

  const propFirmForm = document.getElementById('propfirm-form');
  if (propFirmForm) propFirmForm.addEventListener('submit', submitPropFirmAccount);

  const adForm = document.getElementById('ad-form');
  if (adForm) adForm.addEventListener('submit', submitAd);

  const searchInput = document.getElementById('tradeSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentSearchQuery = e.target.value.toLowerCase();
      renderTradesList();
    });
  }

  const outcomeSelect = document.getElementById('outcomeFilterSelect');
  if (outcomeSelect) {
    outcomeSelect.addEventListener('change', (e) => {
      currentOutcomeFilter = e.target.value;
      renderTradesList();
    });
  }

  const sessionSelect = document.getElementById('sessionFilterSelect');
  if (sessionSelect) {
    sessionSelect.addEventListener('change', (e) => {
      currentSessionFilter = e.target.value;
      renderTradesList();
    });
  }
}

function setupScreenshotHandler() {
  const fileInput = document.getElementById('chartScreenshotInput');
  if (fileInput) {
    fileInput.addEventListener('change', function (e) {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function (uploadEvent) {
        const hiddenInput = document.getElementById('chartScreenshot');
        if (hiddenInput) hiddenInput.value = uploadEvent.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // Same handler, wired to the Dashboard's Quick Analyze form.
  const quickFileInput = document.getElementById('quick-chartScreenshotInput');
  if (quickFileInput) {
    quickFileInput.addEventListener('change', function (e) {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function (uploadEvent) {
        const hiddenInput = document.getElementById('quick-chartScreenshot');
        if (hiddenInput) hiddenInput.value = uploadEvent.target.result;
      };
      reader.readAsDataURL(file);
    });
  }
}

function setupAdImageHandler() {
  const fileInput = document.getElementById('adImageInput');
  if (fileInput) {
    fileInput.addEventListener('change', function (e) {
      const file = e.target.files[0];
      if (!file) return;
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
        alert('Please choose a JPG, PNG, or WebP image.');
        e.target.value = '';
        return;
      }
      if (file.size > 4 * 1024 * 1024) {
        alert('Image must be under 4MB.');
        e.target.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = function (uploadEvent) {
        const hiddenInput = document.getElementById('adImageData');
        if (hiddenInput) hiddenInput.value = uploadEvent.target.result;
        const preview = document.getElementById('adImagePreview');
        if (preview) { preview.src = uploadEvent.target.result; preview.classList.remove('hidden'); }
      };
      reader.readAsDataURL(file);
    });
  }
}

function switchTab(tab) {
  const tabs = document.querySelectorAll('.tab');
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');

  if (tabs.length >= 2) tabs.forEach(t => t.classList.remove('active'));

  if (tab === 'login') {
    if (tabs[0]) tabs[0].classList.add('active');
    if (loginForm) loginForm.classList.remove('hidden');
    if (signupForm) signupForm.classList.add('hidden');
  } else {
    if (tabs[1]) tabs[1].classList.add('active');
    if (signupForm) signupForm.classList.remove('hidden');
    if (loginForm) loginForm.classList.add('hidden');
  }
}

// ---------- AUTH CHECK (bounded by a timeout so it can never hang forever) ----------
async function checkAuth() {
  const authScreen = document.getElementById('auth-screen');
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch('/api/current-user', { signal: controller.signal });
    clearTimeout(timeoutId);
    const data = await res.json();
    if (data.success && data.user) {
      currentUser = data.user;
      showDashboard();
      return;
    }
  } catch (err) {
    clearTimeout(timeoutId);
    console.error('checkAuth failed or timed out:', err);
  }

  if (authScreen) authScreen.classList.remove('hidden');
}

async function handleLogin(e) {
  e.preventDefault();
  const emailEl = document.getElementById('login-email');
  const passwordEl = document.getElementById('login-password');
  const errorEl = document.getElementById('login-error');
  if (!emailEl || !passwordEl) return;

  const email = emailEl.value.trim();
  const password = passwordEl.value;
  if (errorEl) errorEl.innerText = '';

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (data.success) {
      currentUser = data.user;
      showDashboard();
    } else {
      if (errorEl) errorEl.innerText = data.message || 'Login failed';
    }
  } catch (err) {
    if (errorEl) errorEl.innerText = 'Network error during login. Please try again.';
  }
}

async function handleSignup(e) {
  e.preventDefault();
  const usernameEl = document.getElementById('signup-username');
  const emailEl = document.getElementById('signup-email');
  const passwordEl = document.getElementById('signup-password');
  const confirmEl = document.getElementById('signup-confirm');
  const errorEl = document.getElementById('signup-error');
  if (!usernameEl || !emailEl || !passwordEl || !confirmEl) return;

  const username = usernameEl.value.trim();
  const email = emailEl.value.trim();
  const password = passwordEl.value;
  const confirm = confirmEl.value;
  if (errorEl) errorEl.innerText = '';

  if (password !== confirm) {
    if (errorEl) errorEl.innerText = "Passwords do not match!";
    return;
  }

  try {
    const res = await fetch('/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password })
    });
    const data = await res.json();
    if (data.success) {
      currentUser = data.user;
      showDashboard();
    } else {
      if (errorEl) errorEl.innerText = data.message || 'Signup failed';
    }
  } catch (err) {
    if (errorEl) errorEl.innerText = 'Network error during signup. Please try again.';
  }
}

async function logout() {
  if (marketPollTimer) clearInterval(marketPollTimer);
  if (tradesPollTimer) clearInterval(tradesPollTimer);
  if (sessionPollTimer) clearInterval(sessionPollTimer);
  window.location.href = '/auth/logout';
}

function showDashboard() {
  const authScreen = document.getElementById('auth-screen');
  const appShell = document.getElementById('app-shell');
  const welcomeUser = document.getElementById('welcome-user');
  const userEmail = document.getElementById('user-email-display');
  const adminTabBtn = document.getElementById('admin-tab-btn');
  const adminTabBtnMobile = document.getElementById('admin-tab-btn-mobile');
  const dashboardWelcomeName = document.getElementById('dashboard-welcome-name');
  const dashboardWelcomeEmail = document.getElementById('dashboard-welcome-email');
  const adminTabBtnDashboard = document.getElementById('admin-tab-btn-dashboard');

  if (authScreen) authScreen.classList.add('hidden');
  if (appShell) appShell.classList.remove('hidden');
  if (welcomeUser) welcomeUser.innerText = `Welcome, ${currentUser.username}`;
  if (userEmail) userEmail.innerText = currentUser.email;
  if (dashboardWelcomeName) dashboardWelcomeName.innerText = `Welcome, ${currentUser.username}`;
  if (dashboardWelcomeEmail) dashboardWelcomeEmail.innerText = currentUser.email;

  // Admin buttons are a UI convenience only — every admin API is separately
  // authorized server-side, so hiding/showing this is not a security boundary.
  [adminTabBtn, adminTabBtnMobile, adminTabBtnDashboard].forEach(btn => {
    if (!btn) return;
    if (currentUser.role === 'admin') btn.classList.remove('hidden');
    else btn.classList.add('hidden');
  });

  loadTrades();
  fetchMarket();
  fetchExtendedMarket();
  fetchPropFirmAccounts();
  fetchAds();
  loadDonationInfo();
  updateForexSessions();
  fetchEconomicCalendarData();
  setupRiskCalculator();
  setupPositionSizeCalculator();

  if (marketPollTimer) clearInterval(marketPollTimer);
  if (tradesPollTimer) clearInterval(tradesPollTimer);
  if (sessionPollTimer) clearInterval(sessionPollTimer);
  if (extendedMarketPollTimer) clearInterval(extendedMarketPollTimer);
  if (economicCalendarPollTimer) clearInterval(economicCalendarPollTimer);

  marketPollTimer = setInterval(fetchMarket, 15000);
  tradesPollTimer = setInterval(() => { loadTrades(); fetchPropFirmAccounts(); }, 25000);
  sessionPollTimer = setInterval(updateForexSessions, 1000);
  extendedMarketPollTimer = setInterval(fetchExtendedMarket, 300000); // re-render from server cache every 5 min
  economicCalendarPollTimer = setInterval(fetchEconomicCalendarData, 300000); // re-render from server cache every 5 min

  // Router: navigate to whatever hash is present (or default to Dashboard),
  // then listen for further nav clicks / back-forward button use.
  window.addEventListener('hashchange', () => navigateTo(location.hash));
  navigateTo(location.hash || '#dashboard');
}

// ============================================================
// PHASE 1 — MULTI-PAGE ROUTER
// ============================================================
const VIEW_TITLES = {
  dashboard: 'Dashboard',
  journal: 'Trade Journal',
  'ai-mentor': 'AI Mentor',
  analytics: 'Analytics',
  risk: 'Risk Manager',
  propfirm: 'Prop Firm',
  markets: 'Markets',
  'economic-calendar': 'Economic Calendar',
  psychology: 'Psychology',
  'trade-calendar': 'Trade Calendar',
  'position-size': 'Position Size',
  profile: 'Profile',
  settings: 'Settings'
};

function navigateTo(hash) {
  const viewName = (hash || '#dashboard').replace('#', '') || 'dashboard';
  const viewId = `view-${viewName}`;
  const targetView = document.getElementById(viewId);

  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  if (targetView) {
    targetView.classList.remove('hidden');
  } else {
    // Unknown hash — fall back to Dashboard rather than showing a blank page.
    const fallback = document.getElementById('view-dashboard');
    if (fallback) fallback.classList.remove('hidden');
  }

  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.toggle('active', link.dataset.view === viewName);
  });

  const title = VIEW_TITLES[viewName] || 'Dashboard';
  const pageTitleEl = document.getElementById('page-title');
  const mobileTitleEl = document.getElementById('mobile-view-title');
  if (pageTitleEl) pageTitleEl.innerText = title;
  if (mobileTitleEl) mobileTitleEl.innerText = title;

  // Per-view refresh hooks for content that isn't covered by the global polls.
  if (viewName === 'markets') renderMarketsPage();
  if (viewName === 'ai-mentor') renderAiMentorHistory();
  if (viewName === 'profile') renderProfileView();
  if (viewName === 'analytics') renderAnalytics();
  if (viewName === 'psychology') renderPsychologyView();
  if (viewName === 'trade-calendar') renderTradeCalendar();
  if (viewName === 'economic-calendar') renderEconomicCalendar();

  const mainEl = document.querySelector('.app-main');
  if (mainEl) mainEl.scrollTop = 0;
}

function toggleDrawer() {
  const drawer = document.getElementById('mobile-drawer');
  const overlay = document.getElementById('drawer-overlay');
  if (drawer) drawer.classList.toggle('drawer-open');
  if (overlay) overlay.classList.toggle('drawer-open');
}

function closeDrawer() {
  const drawer = document.getElementById('mobile-drawer');
  const overlay = document.getElementById('drawer-overlay');
  if (drawer) drawer.classList.remove('drawer-open');
  if (overlay) overlay.classList.remove('drawer-open');
}

// ============================================================
// FOREX MARKET SESSION TRACKER — timezone-aware (Africa/Lagos,
// Europe/London, America/New_York, Asia/Tokyo), DST-safe, handles
// overlaps and weekend market closure. Verified against manual
// UTC test cases (winter/summer DST shift, Fri-close/Sun-reopen).
// ============================================================
const FOREX_SESSIONS = [
  { key: 'asian', name: 'Asian', flag: '🇯🇵', zone: 'Asia/Tokyo', start: 9, end: 18 },
  { key: 'london', name: 'London', flag: '🇬🇧', zone: 'Europe/London', start: 8, end: 17 },
  { key: 'newyork', name: 'New York', flag: '🇺🇸', zone: 'America/New_York', start: 8, end: 17 }
];

function getZonedParts(date, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false, weekday: 'short',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  return dtf.formatToParts(date).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
}

function getTimeZoneOffsetMinutes(date, timeZone) {
  const p = getZonedParts(date, timeZone);
  const asUTC = Date.UTC(p.year, parseInt(p.month, 10) - 1, p.day, p.hour, p.minute, p.second);
  return (asUTC - date.getTime()) / 60000;
}

// Returns the actual UTC instant of `hour:minute` local time in `timeZone`,
// for the day that is `dayOffset` days from `baseDate` — correctly DST-aware
// because the offset is resolved for that specific calendar day.
function zonedInstant(baseDate, timeZone, hour, minute, dayOffset) {
  const shifted = new Date(baseDate.getTime() + dayOffset * 86400000);
  const p = getZonedParts(shifted, timeZone);
  const guessUTC = Date.UTC(p.year, parseInt(p.month, 10) - 1, p.day, hour, minute, 0);
  const offsetMin = getTimeZoneOffsetMinutes(new Date(guessUTC), timeZone);
  return new Date(guessUTC - offsetMin * 60000);
}

// Standard forex week boundary: closed from Friday 17:00 America/New_York
// until Sunday 17:00 America/New_York, DST-safe.
function getWeekendClosure(now) {
  for (let off = -3; off <= 3; off++) {
    const p = getZonedParts(new Date(now.getTime() + off * 86400000), 'America/New_York');
    if (p.weekday === 'Fri') {
      const closeInstant = zonedInstant(now, 'America/New_York', 17, 0, off);
      const reopenInstant = zonedInstant(now, 'America/New_York', 17, 0, off + 2);
      if (now >= closeInstant && now < reopenInstant) return { closed: true, reopenInstant };
    }
  }
  return { closed: false };
}

function computeForexSessionState(now) {
  const weekend = getWeekendClosure(now);
  const sessionWindows = FOREX_SESSIONS.map(s => {
    let start = null, end = null;
    for (const dayOffset of [-1, 0]) {
      const st = zonedInstant(now, s.zone, s.start, 0, dayOffset);
      const en = zonedInstant(now, s.zone, s.end, 0, dayOffset);
      if (now >= st && now < en) { start = st; end = en; }
    }
    return { ...s, start, end, active: !weekend.closed && start !== null };
  });

  const activeSessions = sessionWindows.filter(s => s.active);

  // Soonest upcoming start across all sessions/day-offsets (today or tomorrow).
  let nextSession = null, nextStart = null;
  for (const s of FOREX_SESSIONS) {
    for (const dayOffset of [0, 1]) {
      const st = zonedInstant(now, s.zone, s.start, 0, dayOffset);
      if (st > now && (!nextStart || st < nextStart)) { nextStart = st; nextSession = s; }
    }
  }
  // If the market is in its weekend closure, the next real open is whichever
  // computed start falls after the weekend reopen instant (already correct
  // since Monday's Asian session start is later than the reopen instant).

  // Soonest end among currently active sessions (time remaining in session).
  let soonestEnd = null;
  activeSessions.forEach(s => { if (!soonestEnd || s.end < soonestEnd) soonestEnd = s.end; });

  return { weekendClosed: weekend.closed, activeSessions, nextSession, nextStart, soonestEnd };
}

function formatHMS(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function updateForexSessions() {
  const now = new Date();
  const watParts = getZonedParts(now, 'Africa/Lagos');

  const timeEl = document.getElementById('wat-time-display');
  const sessionEl = document.getElementById('active-session-display');
  const countdownEl = document.getElementById('session-countdown');
  const remainingEl = document.getElementById('session-remaining');
  const overlapEl = document.getElementById('session-overlap');

  if (timeEl) timeEl.innerText = `${watParts.hour}:${watParts.minute}:${watParts.second} WAT`;

  const state = computeForexSessionState(now);

  if (sessionEl) {
    if (state.weekendClosed) {
      sessionEl.innerHTML = `<span style="color: var(--text-dim);">💤 Market Closed (Weekend)</span>`;
    } else if (state.activeSessions.length > 0) {
      sessionEl.innerHTML = state.activeSessions.map(s =>
        `<span style="background: var(--accent-soft); color: var(--accent); padding: 3px 8px; border-radius: 4px; margin-right: 6px; display:inline-block;">${s.flag} ${s.name}</span>`
      ).join(' ');
    } else {
      sessionEl.innerHTML = `<span style="color: var(--text-dim);">💤 Inter-session / Market Quiet</span>`;
    }
  }

  if (overlapEl) {
    if (!state.weekendClosed && state.activeSessions.length > 1) {
      overlapEl.innerHTML = `<span class="overlap-badge">⚡ OVERLAP: ${state.activeSessions.map(s => s.name).join(' × ')}</span>`;
      overlapEl.classList.remove('hidden');
    } else {
      overlapEl.classList.add('hidden');
      overlapEl.innerHTML = '';
    }
  }

  if (remainingEl) {
    if (!state.weekendClosed && state.soonestEnd) {
      remainingEl.innerText = `Time left in session: ${formatHMS(state.soonestEnd - now)}`;
    } else {
      remainingEl.innerText = '';
    }
  }

  if (countdownEl) {
    if (state.nextSession && state.nextStart) {
      const label = state.weekendClosed ? 'Market reopens' : `Next: ${state.nextSession.flag} ${state.nextSession.name}`;
      countdownEl.innerText = `${label} in ${formatHMS(state.nextStart - now)}`;
    } else {
      countdownEl.innerText = 'Calculating...';
    }
  }
}

// ---------- LIVE MARKET BOARD ----------
async function fetchMarket() {
  try {
    const res = await fetch('/api/market');
    const data = await res.json();
    if (!data.success) return;
    latestMarket = data.data || {};

    let mostRecent = null;
    TRACKED.forEach(key => {
      const m = latestMarket[key];
      const priceEl = document.getElementById(`mkt-${key}-price`);
      const changeEl = document.getElementById(`mkt-${key}-change`);
      const statusEl = document.getElementById(`mkt-${key}-status`);
      if (!priceEl) return;

      if (m && m.price !== null && m.price !== undefined) {
        priceEl.innerText = formatMarketPrice(key, m.price);
        if (m.change !== null && m.change !== undefined) {
          const up = m.change >= 0;
          changeEl.innerText = `${up ? '▲' : '▼'} ${up ? '+' : ''}${m.change.toFixed(key === 'XAUUSD' || key === 'BTCUSD' ? 2 : 5)}`;
          changeEl.className = 'market-change num ' + (up ? 'up' : 'down');
        } else {
          changeEl.innerText = '—';
          changeEl.className = 'market-change num';
        }
        if (m.updatedAt && (!mostRecent || new Date(m.updatedAt) > mostRecent)) mostRecent = new Date(m.updatedAt);
      } else {
        priceEl.innerText = '—';
      }

      const status = (m && m.status) || 'offline';
      if (statusEl) {
        statusEl.className = 'market-status ' + status;
        statusEl.innerHTML = `<span class="dot"></span>${status.toUpperCase()}`;
      }
    });

    const updatedEl = document.getElementById('market-updated');
    if (updatedEl) updatedEl.innerText = mostRecent ? `Updated ${formatTime(mostRecent)}` : 'Awaiting first update';
    updateRunningPrices();
  } catch (err) {
    console.error('Market fetch failed:', err);
  }
}

function formatMarketPrice(key, price) {
  if (key === 'BTCUSD') return '$' + Number(price).toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (key === 'XAUUSD') return Number(price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (key === 'USDJPY') return Number(price).toFixed(3);
  return Number(price).toFixed(5);
}

function formatTime(d) {
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function normalizePairKey(raw) {
  if (!raw) return null;
  let k = String(raw).toUpperCase().replace(/[^A-Z]/g, '');
  if (k === 'GOLD' || k === 'XAU') k = 'XAUUSD';
  if (k === 'BTC') k = 'BTCUSD';
  if (k === 'ETH') k = 'ETHUSD';
  // FIX: previously only checked the core TRACKED list, so the Open Trades
  // section and running-trade "current price" display silently showed
  // nothing for any of the 13 extended instruments even though the backend
  // was (now correctly) monitoring and could close them.
  if (TRACKED.includes(k)) return k;
  if (typeof EXTENDED_TRACKED !== 'undefined' && EXTENDED_TRACKED.includes(k)) return k;
  return null;
}

// Checks both live-price caches, core first. Mirrors the server's
// getCachedPrice() so the UI and the backend agree on what "the live price"
// for a given pair actually is.
function getLivePrice(key) {
  if (latestMarket[key] && latestMarket[key].price !== null && latestMarket[key].price !== undefined) return latestMarket[key].price;
  if (latestExtendedMarket[key] && latestExtendedMarket[key].price !== null && latestExtendedMarket[key].price !== undefined) return latestExtendedMarket[key].price;
  return null;
}

function updateRunningPrices() {
  allTrades.forEach((t) => {
    if (t.outcome !== 'Running') return;
    const key = normalizePairKey(t.pair);
    if (!key) return;
    const price = getLivePrice(key);
    if (price === null) return;
    const el = document.getElementById(`current-price-${t._id}`);
    if (el) el.innerText = formatMarketPrice(key, price);
  });
}

// ---------- SETUP & STRATEGY TAGS ----------
function toggleTag(element) {
  element.classList.toggle('active');
}

function getSelectedTags() {
  const pills = document.querySelectorAll('.strategy-pill.active');
  const tags = [];
  pills.forEach(p => tags.push(p.innerText.trim()));
  return tags;
}

function clearTags() {
  document.querySelectorAll('.strategy-pill').forEach(p => p.classList.remove('active'));
}

// ============================================================
// PHASE 3 — PSYCHOLOGY CHECK-IN (trade form collection)
// ============================================================
function collectPsychologyInput() {
  // Range inputs default to their midpoint value even when the user never
  // touches them (browsers don't leave them "empty") — so we can't tell
  // "untouched" from "deliberately rated 5" by reading el.value alone.
  // The oninput handler on each slider updates its paired -val span from
  // "—" to the actual number the moment it's first touched, so checking
  // whether that span still reads "—" is the real signal of intent here.
  const ratingVal = (id) => {
    const el = document.getElementById(id);
    const valEl = document.getElementById(id + '-val');
    if (!el || !valEl || valEl.innerText === '—') return null;
    const n = parseInt(el.value, 10);
    return isNaN(n) ? null : n;
  };
  const checkVal = (id) => {
    const el = document.getElementById(id);
    return el ? el.checked : null;
  };
  const psych = {
    confidence: ratingVal('psych-confidence'),
    fear: ratingVal('psych-fear'),
    fomo: ratingVal('psych-fomo'),
    patience: ratingVal('psych-patience'),
    revengeUrge: ratingVal('psych-revengeUrge'),
    followedPlan: checkVal('psych-followedPlan'),
    followedStrategy: checkVal('psych-followedStrategy'),
    movedStopLoss: checkVal('psych-movedStopLoss'),
    closedEarly: checkVal('psych-closedEarly'),
    revengeTraded: checkVal('psych-revengeTraded'),
    overLeveraged: checkVal('psych-overLeveraged')
  };
  // If the user never touched a single slider and never checked a single
  // box, don't send a meaningless all-nulls/all-false object — send null
  // so the server stores nothing rather than a fake-looking empty shell.
  const hasAnyData = Object.values(psych).some(v => v !== null && v !== false);
  return hasAnyData ? psych : null;
}

function resetPsychologyInput() {
  ['confidence', 'fear', 'fomo', 'patience', 'revengeUrge'].forEach(id => {
    const el = document.getElementById('psych-' + id);
    const valEl = document.getElementById('psych-' + id + '-val');
    if (el) el.value = '';
    if (valEl) valEl.innerText = '—';
  });
  ['followedPlan', 'followedStrategy', 'movedStopLoss', 'closedEarly', 'revengeTraded', 'overLeveraged'].forEach(id => {
    const el = document.getElementById('psych-' + id);
    if (el) el.checked = false;
  });
}

// ============================================================
// PROP FIRM ACCOUNT TRACKER
// ============================================================
async function fetchPropFirmAccounts() {
  if (!currentUser) return;
  try {
    const res = await fetch('/api/propfirm/accounts');
    const data = await res.json();
    if (data.success) {
      propFirmAccounts = data.accounts;
      if (!selectedPropFirmAccountId && propFirmAccounts.length) {
        selectedPropFirmAccountId = propFirmAccounts[0]._id;
      }
      populatePropFirmSelectors();
      renderPropFirmSummary();
      renderPropFirmAccountList();
    }
  } catch (err) {
    console.error('Prop firm fetch failed:', err);
  }
}

function populatePropFirmSelectors() {
  const tradeFormSelect = document.getElementById('tradePropFirmAccount');
  const switcherSelect = document.getElementById('propfirm-account-switcher');
  [tradeFormSelect, switcherSelect].forEach(sel => {
    if (!sel) return;
    const currentVal = sel.value;
    sel.innerHTML = '<option value="">— Personal / Not linked —</option>' +
      propFirmAccounts.map(a => `<option value="${a._id}">${escapeHtml(a.accountName)}${a.firmName ? ' (' + escapeHtml(a.firmName) + ')' : ''}</option>`).join('');
    if (currentVal && propFirmAccounts.some(a => a._id === currentVal)) sel.value = currentVal;
    else if (sel === switcherSelect && selectedPropFirmAccountId) sel.value = selectedPropFirmAccountId;
  });
}

function onPropFirmSwitcherChange(id) {
  selectedPropFirmAccountId = id || null;
  renderPropFirmSummary();
}

function renderPropFirmAccountList() {
  const listEl = document.getElementById('propfirm-account-list');
  if (!listEl) return;
  if (!propFirmAccounts.length) {
    listEl.innerHTML = '<div class="empty-state">No prop firm accounts yet. Add one to start tracking drawdown and profit targets.</div>';
    return;
  }
  listEl.innerHTML = propFirmAccounts.map(a => `
    <div class="propfirm-account-chip ${a._id === selectedPropFirmAccountId ? 'active' : ''}" onclick="onPropFirmSwitcherChange('${a._id}'); document.getElementById('propfirm-account-switcher').value='${a._id}';">
      ${escapeHtml(a.accountName)} <span class="chip-status status-${a.stats.status.toLowerCase()}">${a.stats.status}</span>
    </div>
  `).join('');
}

function renderPropFirmSummary() {
  const wrap = document.getElementById('propfirm-summary');
  const warningEl = document.getElementById('propfirm-warning');
  const chartEl = document.getElementById('propfirm-chart');
  if (!wrap) return;

  const account = propFirmAccounts.find(a => a._id === selectedPropFirmAccountId);
  if (!account) {
    wrap.innerHTML = '<div class="empty-state">Select or create a prop firm account to see live stats.</div>';
    if (warningEl) { warningEl.classList.add('hidden'); warningEl.innerHTML = ''; }
    if (chartEl) chartEl.innerHTML = '';
    return;
  }

  const s = account.stats;
  const fmtD = (n) => '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  wrap.innerHTML = `
    <div class="propfirm-grid">
      <div><div class="modal-field-label">Account Size</div><div class="modal-field-value num">${fmtD(s.startingBalance)}</div></div>
      <div><div class="modal-field-label">Current Balance</div><div class="modal-field-value num">${fmtD(s.currentBalance)}</div></div>
      <div><div class="modal-field-label">Profit</div><div class="modal-field-value num" style="color:${s.profit >= 0 ? 'var(--win)' : 'var(--loss)'};">${s.profit >= 0 ? '+' : ''}${fmtD(s.profit)}</div></div>
      <div><div class="modal-field-label">Profit Target</div><div class="modal-field-value num">${fmtD(s.profitTargetDollars)} (${s.profitTargetProgressPct.toFixed(0)}%)</div></div>
      <div><div class="modal-field-label">Max Drawdown</div><div class="modal-field-value num">${fmtD(s.maxDrawdownDollars)}</div></div>
      <div><div class="modal-field-label">Drawdown Used</div><div class="modal-field-value num">${fmtD(s.drawdownUsedDollars)} (${s.drawdownUsedPct.toFixed(0)}%)</div></div>
      <div><div class="modal-field-label">Remaining Drawdown</div><div class="modal-field-value num">${fmtD(s.remainingDrawdownDollars)}</div></div>
      <div><div class="modal-field-label">Daily Drawdown Remaining</div><div class="modal-field-value num">${fmtD(s.remainingDailyDrawdownDollars)}</div></div>
      <div><div class="modal-field-label">Open Risk (Running)</div><div class="modal-field-value num">${fmtD(s.openRiskDollars)}</div></div>
      <div><div class="modal-field-label">Win Rate</div><div class="modal-field-value num">${s.winRate.toFixed(1)}% (${s.wins}W / ${s.losses}L)</div></div>
    </div>
  `;

  if (warningEl) {
    if (s.status === 'Breached') {
      warningEl.innerHTML = '🔴 <b>ACCOUNT LIMIT BREACHED</b> — max or daily drawdown has been exceeded.';
      warningEl.className = 'propfirm-warning breached';
      warningEl.classList.remove('hidden');
    } else if (s.status === 'Critical') {
      warningEl.innerHTML = `⚠️ <b>CRITICAL:</b> ${Math.max(s.drawdownUsedPct, s.dailyDrawdownUsedPct).toFixed(0)}% of a drawdown limit used.`;
      warningEl.className = 'propfirm-warning critical';
      warningEl.classList.remove('hidden');
    } else if (s.status === 'Warning') {
      warningEl.innerHTML = `⚠️ WARNING — ${Math.max(s.drawdownUsedPct, s.dailyDrawdownUsedPct).toFixed(0)}% of a drawdown limit used.`;
      warningEl.className = 'propfirm-warning warning';
      warningEl.classList.remove('hidden');
    } else if (s.status === 'Caution') {
      warningEl.innerHTML = `You have used ${Math.max(s.drawdownUsedPct, s.dailyDrawdownUsedPct).toFixed(0)}% of a drawdown limit.`;
      warningEl.className = 'propfirm-warning caution';
      warningEl.classList.remove('hidden');
    } else {
      warningEl.classList.add('hidden');
      warningEl.innerHTML = '';
    }
  }

  if (chartEl) renderBalanceChart(chartEl, s.balanceCurve, s.startingBalance, s.peakBalance, s.maxDrawdownDollars);
}

function renderBalanceChart(container, curve, startingBalance, peakBalance, maxDrawdownDollars) {
  if (!curve || curve.length < 2) {
    container.innerHTML = '<div class="empty-state" style="padding:14px;">Not enough closed trades yet for a balance chart.</div>';
    return;
  }
  const w = 600, h = 160, pad = 10;
  const balances = curve.map(p => p.balance);
  const dangerLine = peakBalance - maxDrawdownDollars;
  const min = Math.min(...balances, dangerLine) - 5;
  const max = Math.max(...balances) + 5;
  const range = (max - min) || 1;
  const stepX = (w - pad * 2) / (curve.length - 1);
  const toY = (v) => h - pad - ((v - min) / range) * (h - pad * 2);

  const points = curve.map((p, i) => `${(pad + i * stepX).toFixed(1)},${toY(p.balance).toFixed(1)}`).join(' ');
  const endColor = balances[balances.length - 1] >= startingBalance ? 'var(--win)' : 'var(--loss)';
  const dangerY = toY(dangerLine).toFixed(1);

  container.innerHTML = `
    <svg viewBox="0 0 ${w} ${h}" style="width:100%; height:auto; display:block;">
      <line x1="${pad}" y1="${dangerY}" x2="${w - pad}" y2="${dangerY}" stroke="var(--loss)" stroke-dasharray="4 4" stroke-width="1" opacity="0.6"/>
      <polyline points="${points}" fill="none" stroke="${endColor}" stroke-width="2" />
    </svg>
    <div class="progress-labels"><span>Start ${curve[0] ? '' : ''}$${startingBalance.toLocaleString()}</span><span style="color:var(--loss);">- - - Max drawdown floor</span></div>
  `;
}

function openPropFirmModal(accountId) {
  const modal = document.getElementById('propfirm-modal');
  const form = document.getElementById('propfirm-form');
  if (!modal || !form) return;
  form.reset();
  document.getElementById('propfirm-edit-id').value = '';
  document.getElementById('propfirm-modal-title').innerText = 'New Prop Firm Account';

  if (accountId) {
    const acc = propFirmAccounts.find(a => a._id === accountId);
    if (acc) {
      document.getElementById('propfirm-modal-title').innerText = 'Edit Prop Firm Account';
      document.getElementById('propfirm-edit-id').value = acc._id;
      document.getElementById('pf-firmName').value = acc.firmName || '';
      document.getElementById('pf-accountName').value = acc.accountName || '';
      document.getElementById('pf-accountSize').value = acc.accountSize;
      document.getElementById('pf-maxDD').value = acc.maxOverallDrawdownPct;
      document.getElementById('pf-dailyDD').value = acc.maxDailyDrawdownPct;
      document.getElementById('pf-target').value = acc.profitTargetPct;
      document.getElementById('pf-phase').value = acc.phase || 'Evaluation';
      document.getElementById('pf-label').value = acc.accountLabel || '';
    }
  }
  modal.classList.remove('hidden');
}

function closePropFirmModal() {
  const modal = document.getElementById('propfirm-modal');
  if (modal) modal.classList.add('hidden');
}

async function submitPropFirmAccount(e) {
  e.preventDefault();
  const id = document.getElementById('propfirm-edit-id').value;
  const payload = {
    firmName: document.getElementById('pf-firmName').value,
    accountName: document.getElementById('pf-accountName').value,
    accountSize: document.getElementById('pf-accountSize').value,
    maxOverallDrawdownPct: document.getElementById('pf-maxDD').value,
    maxDailyDrawdownPct: document.getElementById('pf-dailyDD').value,
    profitTargetPct: document.getElementById('pf-target').value,
    phase: document.getElementById('pf-phase').value,
    accountLabel: document.getElementById('pf-label').value
  };
  try {
    const res = await fetch(id ? `/api/propfirm/accounts/${id}` : '/api/propfirm/accounts', {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      closePropFirmModal();
      if (!id) selectedPropFirmAccountId = data.account._id;
      fetchPropFirmAccounts();
    } else {
      alert(data.message || 'Could not save account.');
    }
  } catch (err) {
    alert('Network error: ' + err.message);
  }
}

async function deletePropFirmAccount(id) {
  if (!confirm('Delete this prop firm account? Linked trades will be kept but unlinked from it.')) return;
  try {
    const res = await fetch(`/api/propfirm/accounts/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      if (selectedPropFirmAccountId === id) selectedPropFirmAccountId = null;
      fetchPropFirmAccounts();
    } else {
      alert(data.message || 'Delete failed.');
    }
  } catch (err) {
    alert('Network error: ' + err.message);
  }
}

// ---------- TRADE SUBMISSION ----------
// Shared by both the full Trade Journal form and the Dashboard's Quick
// Analyze form. `quick` selects the -quick suffixed field ids and omits
// fields the quick form doesn't have (tags/prop account/risk/PL) — the
// server treats those as simply not provided, no fake data involved.
async function submitTrade(e, quick) {
  e.preventDefault();
  const p = quick ? 'quick-' : '';
  const get = (id) => document.getElementById(p + id);

  const payload = {
    currencyPair: get('currencyPair').value,
    tradeDirection: get('tradeDirection').value,
    entryPrice: get('entryPrice').value,
    exitPrice: quick ? '' : get('exitPrice').value,
    stopLoss: get('stopLoss').value,
    takeProfit: get('takeProfit').value,
    tradeOutcome: quick ? 'Running' : get('tradeOutcome').value,
    tradeNotes: get('tradeNotes').value,
    session: get('tradeSession') ? get('tradeSession').value : 'London',
    tags: quick ? [] : getSelectedTags(),
    chartScreenshot: get('chartScreenshot') ? get('chartScreenshot').value.trim() : null,
    propFirmAccountId: quick ? '' : (document.getElementById('tradePropFirmAccount') ? document.getElementById('tradePropFirmAccount').value : ''),
    riskAmount: quick ? '' : (document.getElementById('tradeRiskAmount') ? document.getElementById('tradeRiskAmount').value : ''),
    realizedPL: quick ? '' : (document.getElementById('tradeRealizedPL') ? document.getElementById('tradeRealizedPL').value : ''),
    psychology: quick ? null : collectPsychologyInput()
  };

  const aiBox = document.getElementById(quick ? 'quick-ai-result' : 'ai-result');
  if (aiBox) {
    aiBox.classList.remove('hidden');
    aiBox.innerText = "Analyzing trade setup with AI mentor...";
  }

  try {
    const res = await fetch('/api/analyze', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      if (aiBox) { aiBox.classList.remove('hidden'); aiBox.innerHTML = renderAiResultHtml(data.text, data.structured); }
      if (!quick) clearTags();
      if (get('chartScreenshot')) get('chartScreenshot').value = '';
      if (get('chartScreenshotInput')) get('chartScreenshotInput').value = '';
      if (!quick) {
        if (document.getElementById('tradeRiskAmount')) document.getElementById('tradeRiskAmount').value = '';
        if (document.getElementById('tradeRealizedPL')) document.getElementById('tradeRealizedPL').value = '';
        resetPsychologyInput();
      }
      loadTrades();
      fetchPropFirmAccounts();
    } else {
      if (aiBox) aiBox.innerText = "Error analyzing trade: " + (data.message || 'unknown error');
    }
  } catch (err) {
    if (aiBox) aiBox.innerText = "Network error while saving trade: " + err.message;
  }
}

// Tracks each trade's outcome as of the last loadTrades() call, so we can
// detect a real Running→Win/Loss transition (server-side auto-close) and
// show a genuine toast notification — never a fabricated one.
let previousOutcomeById = {};

async function loadTrades() {
  if (!currentUser) return;
  try {
    const res = await fetch('/api/trades');
    const data = await res.json();

    if (data.success && data.trades) {
      allTrades = [...data.trades].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      // Detect auto-closed trades since the last poll and surface a real toast.
      allTrades.forEach(t => {
        const prev = previousOutcomeById[t._id];
        if (prev === 'Running' && (t.outcome === 'Win' || t.outcome === 'Loss')) {
          showToast(t);
        }
        previousOutcomeById[t._id] = t.outcome;
      });

      const total = allTrades.length;
      const wins = allTrades.filter(t => t.outcome === 'Win').length;
      const losses = allTrades.filter(t => t.outcome === 'Loss').length;
      const decided = wins + losses;
      const winRate = decided > 0 ? ((wins / decided) * 100).toFixed(1) : '0.0';

      setText('stat-total', total);
      setText('stat-winrate', winRate + '%');
      setText('stat-record', `${wins}W / ${losses}L`);
      setText('stat-streak', computeStreak(allTrades));

      const metrics = computeAdvancedMetrics(allTrades);
      setText('stat-avgrr', metrics.avgRR + 'R');
      setText('stat-profitfactor', metrics.profitFactor);

      updatePropGuardrails(allTrades);
      renderTradesList();
      renderRecentTrades();
      renderOpenTradesSection();
      if (!document.getElementById('view-ai-mentor').classList.contains('hidden')) renderAiMentorHistory();
      if (!document.getElementById('view-profile').classList.contains('hidden')) renderProfileView();
      if (!document.getElementById('view-analytics').classList.contains('hidden')) renderAnalytics();
      if (!document.getElementById('view-psychology').classList.contains('hidden')) renderPsychologyView();
      if (!document.getElementById('view-trade-calendar').classList.contains('hidden')) renderTradeCalendar();
    } else {
      allTrades = [];
      setText('stat-total', 0);
      setText('stat-winrate', '0.0%');
      setText('stat-record', '0W / 0L');
      setText('stat-streak', '—');
      setText('stat-avgrr', '0.00R');
      setText('stat-profitfactor', '0.00');
      updatePropGuardrails([]);
      const listDiv = document.getElementById('trades-list');
      if (listDiv) listDiv.innerHTML = '<div class="empty-state">No trades journaled yet — log your first setup above.</div>';
      const recentDiv = document.getElementById('recent-trades-list');
      if (recentDiv) recentDiv.innerHTML = '<div class="empty-state">No trades yet.</div>';
    }
  } catch (err) {
    console.error('loadTrades failed:', err);
  }
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.innerText = val;
}

// ---------- PROP FIRM RISK GUARDRAILS (personal, non-account-specific) ----------
function updatePropGuardrails(tradesList) {
  const maxDailyRiskDollars = 500;
  let totalExposedRisk = 0;

  tradesList.forEach(t => {
    if (t.outcome === 'Running') {
      if (t.riskAmount) totalExposedRisk += Number(t.riskAmount);
      else if (t.entry && t.stopLoss) totalExposedRisk += Math.abs(Number(t.entry) - Number(t.stopLoss)) * 100;
    }
  });

  const riskPercentageUsed = Math.min(100, Math.max(0, (totalExposedRisk / maxDailyRiskDollars) * 100));
  const bufferRemaining = Math.max(0, 100 - riskPercentageUsed).toFixed(1);

  const statusText = document.getElementById('guardrail-status-text');
  const barFill = document.getElementById('guardrail-bar');
  const pctDisplay = document.getElementById('guardrail-pct');
  if (!statusText || !barFill || !pctDisplay) return;

  if (riskPercentageUsed > 80) {
    statusText.innerText = `⚠️ High Risk Exposure (${riskPercentageUsed.toFixed(1)}% of limit!)`;
    statusText.style.color = 'var(--loss)';
    barFill.style.background = 'var(--loss)';
  } else if (riskPercentageUsed > 40) {
    statusText.innerText = `Moderate Exposure (${riskPercentageUsed.toFixed(1)}% utilized)`;
    statusText.style.color = 'var(--accent)';
    barFill.style.background = 'var(--accent)';
  } else {
    statusText.innerText = `Safe zone (${riskPercentageUsed.toFixed(1)}% risk exposed)`;
    statusText.style.color = 'var(--win)';
    barFill.style.background = 'var(--win)';
  }

  barFill.style.width = `${bufferRemaining}%`;
  pctDisplay.innerText = `${bufferRemaining}% Buffer`;
}

// ---------- ADVANCED ANALYTICS ----------
function computeAdvancedMetrics(tradesList) {
  let totalGrossProfit = 0, totalGrossLoss = 0, riskRewardSum = 0, validRRCount = 0;

  tradesList.forEach(t => {
    const entry = Number(t.entry), sl = Number(t.stopLoss), tp = Number(t.takeProfit), exit = Number(t.exit);

    if (!isNaN(entry) && !isNaN(sl) && !isNaN(tp) && entry !== sl) {
      const risk = Math.abs(entry - sl);
      const reward = Math.abs(tp - entry);
      riskRewardSum += (reward / risk);
      validRRCount++;
    }

    if (t.outcome === 'Win' && !isNaN(entry) && !isNaN(exit)) totalGrossProfit += Math.abs(exit - entry);
    else if (t.outcome === 'Loss' && !isNaN(entry) && !isNaN(exit)) totalGrossLoss += Math.abs(exit - entry);
  });

  const avgRR = validRRCount > 0 ? (riskRewardSum / validRRCount).toFixed(2) : '0.00';
  const profitFactor = totalGrossLoss > 0 ? (totalGrossProfit / totalGrossLoss).toFixed(2) : (totalGrossProfit > 0 ? 'Infinite' : '0.00');
  return { avgRR, profitFactor };
}

function renderTradesList() {
  const listDiv = document.getElementById('trades-list');
  if (!listDiv) return;

  let filtered = allTrades.filter(t => {
    const matchesSearch = !currentSearchQuery ||
      (t.pair && t.pair.toLowerCase().includes(currentSearchQuery)) ||
      (t.notes && t.notes.toLowerCase().includes(currentSearchQuery));
    const matchesOutcome = currentOutcomeFilter === 'All' || t.outcome === currentOutcomeFilter;
    const matchesSession = currentSessionFilter === 'All' || t.session === currentSessionFilter;
    return matchesSearch && matchesOutcome && matchesSession;
  });

  if (filtered.length === 0) {
    listDiv.innerHTML = '<div class="empty-state">No matching trades found.</div>';
    return;
  }

  listDiv.innerHTML = filtered.map((t) => {
    const isRunning = t.outcome === 'Running';
    const key = normalizePairKey(t.pair);
    const livePrice = key ? getLivePrice(key) : null;
    const currentDisplay = isRunning
      ? (livePrice !== null ? formatMarketPrice(key, livePrice) : (t.currentPrice ?? '—'))
      : null;

    const accountName = t.propFirmAccountId ? (propFirmAccounts.find(a => a._id === t.propFirmAccountId)?.accountName) : null;
    const riskBadge = t.riskAmount ? ` · Risk $${t.riskAmount}` : '';
    const plBadge = (t.realizedPL !== null && t.realizedPL !== undefined) ? ` · P/L ${t.realizedPL >= 0 ? '+' : ''}$${t.realizedPL}` : '';

    const metaLine = isRunning
      ? `Entry ${fmt(t.entry)} → Current <span id="current-price-${t._id}" class="num" style="color:var(--running);">${currentDisplay ?? '—'}</span> · ${formatDate(t.createdAt)}${t.session ? ' · ' + escapeHtml(t.session) : ''}${riskBadge}`
      : `Entry ${fmt(t.entry)} → Exit ${fmt(t.exit)} · ${formatDate(t.createdAt)}${t.exitReason ? ' · ' + escapeHtml(t.exitReason) : ''}${riskBadge}${plBadge}`;

    return `
      <div class="trade-row" onclick="openModal('${t._id}')">
        <div class="trade-row-left">
          <span class="trade-dir-pill ${t.direction === 'Sell' ? 'sell' : 'buy'}">${t.direction === 'Sell' ? 'SELL' : 'BUY'}</span>
          <div class="trade-row-info">
            <div class="trade-pair">${escapeHtml(t.pair)}${accountName ? ` <span class="trade-account-tag">${escapeHtml(accountName)}</span>` : ''}</div>
            <div class="trade-meta">${metaLine}</div>
          </div>
        </div>
        <span class="trade-outcome-tag ${t.outcome}">${labelOutcome(t.outcome)}</span>
      </div>
    `;
  }).join('');
}

function computeStreak(sortedTrades) {
  const decided = sortedTrades.filter(t => t.outcome === 'Win' || t.outcome === 'Loss');
  if (decided.length === 0) return '—';
  const first = decided[0].outcome;
  let count = 0;
  for (const t of decided) {
    if (t.outcome === first) count++;
    else break;
  }
  const noun = first === 'Win' ? 'win' : 'loss';
  const plural = count > 1 ? (first === 'Win' ? 's' : 'es') : '';
  return `${count} ${noun}${plural}`;
}

function labelOutcome(o) {
  if (o === 'BreakEven') return 'Break-even';
  return o;
}

function fmt(v) {
  if (v === null || v === undefined || v === '') return 'N/A';
  return v;
}

function formatDate(d) {
  if (!d) return '';
  const date = new Date(d);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.innerText = str;
  return div.innerHTML;
}

// ---------- CSV EXPORT ----------
function exportTradesCSV() {
  if (!allTrades.length) { alert('No trades to export yet.'); return; }
  const headers = ['Pair', 'Direction', 'Entry', 'Exit', 'StopLoss', 'TakeProfit', 'Outcome', 'ExitReason', 'Session', 'Tags', 'RiskAmount', 'RealizedPL', 'Notes', 'DateLogged'];
  const rows = allTrades.map(t => [
    t.pair, t.direction, fmt(t.entry), fmt(t.exit), fmt(t.stopLoss), fmt(t.takeProfit),
    t.outcome, t.exitReason || '', t.session || '', (t.tags || []).join('; '),
    fmt(t.riskAmount), fmt(t.realizedPL),
    (t.notes || '').replace(/"/g, '""'), formatDate(t.createdAt)
  ]);
  const csvContent = [headers, ...rows].map(row => row.map(field => `"${String(field ?? '')}"`).join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `afamefune-trades-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ---------- MODAL ----------
function openModal(id) {
  const t = allTrades.find(x => x._id === id);
  if (!t) return;

  document.getElementById('modal-pair').innerText = t.pair;
  document.getElementById('modal-direction').innerText = t.direction || 'N/A';
  const outcomeEl = document.getElementById('modal-outcome');
  outcomeEl.innerText = labelOutcome(t.outcome);
  outcomeEl.style.color = t.outcome === 'Win' ? 'var(--win)' : t.outcome === 'Loss' ? 'var(--loss)' : t.outcome === 'Running' ? 'var(--running)' : 'var(--text)';
  document.getElementById('modal-entry').innerText = fmt(t.entry);
  document.getElementById('modal-exit').innerText = fmt(t.exit);
  document.getElementById('modal-sl').innerText = fmt(t.stopLoss);
  document.getElementById('modal-tp').innerText = fmt(t.takeProfit);
  document.getElementById('modal-notes').innerText = t.notes && t.notes.trim() ? t.notes : 'No notes recorded.';

  const sessionEl = document.getElementById('modal-session');
  if (sessionEl) sessionEl.innerText = t.session || 'N/A';

  const tagsEl = document.getElementById('modal-tags');
  if (tagsEl) tagsEl.innerText = (t.tags && t.tags.length) ? t.tags.join(', ') : 'None';

  const accountWrap = document.getElementById('modal-account-wrap');
  if (accountWrap) {
    const account = t.propFirmAccountId ? propFirmAccounts.find(a => a._id === t.propFirmAccountId) : null;
    if (account || t.riskAmount || (t.realizedPL !== null && t.realizedPL !== undefined) || (t.realizedR !== null && t.realizedR !== undefined)) {
      document.getElementById('modal-account').innerText = account ? account.accountName : 'Personal';
      document.getElementById('modal-risk').innerText = t.riskAmount ? '$' + t.riskAmount : 'N/A';
      const plParts = [];
      if (t.realizedPL !== null && t.realizedPL !== undefined) plParts.push((t.realizedPL >= 0 ? '+' : '') + '$' + t.realizedPL);
      if (t.realizedR !== null && t.realizedR !== undefined) plParts.push(`(${t.realizedR >= 0 ? '+' : ''}${t.realizedR.toFixed(2)}R)`);
      document.getElementById('modal-pl').innerText = plParts.length ? plParts.join(' ') : 'N/A';
      accountWrap.classList.remove('hidden');
    } else {
      accountWrap.classList.add('hidden');
    }
  }

  const screenshotContainer = document.getElementById('modal-screenshot-container');
  const screenshotImg = document.getElementById('modal-screenshot-img');
  if (screenshotContainer && screenshotImg) {
    if (t.chartScreenshot) { screenshotImg.src = t.chartScreenshot; screenshotContainer.classList.remove('hidden'); }
    else screenshotContainer.classList.add('hidden');
  }

  const aiContainer = document.getElementById('modal-ai-container');
  const aiText = document.getElementById('modal-ai-text');
  if (aiContainer && aiText) {
    if (t.aiAnalysisText || t.aiStructured) { aiText.innerHTML = renderAiResultHtml(t.aiAnalysisText, t.aiStructured); aiContainer.classList.remove('hidden'); }
    else aiContainer.classList.add('hidden');
  }

  document.getElementById('trade-modal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('trade-modal').classList.add('hidden');
}

function closeModalOnOverlay(e) {
  if (e.target.id === 'trade-modal') closeModal();
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeModal(); closePropFirmModal(); closeAdModal(); closeDrawer(); }
});

async function confirmReset() {
  const confirmation = prompt("Are you sure you want to reset all data and clear your win/loss rates back to zero?\nType 'yes' to confirm:");
  if (confirmation && confirmation.trim().toLowerCase() === 'yes') {
    try {
      const res = await fetch('/api/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      const data = await res.json();
      if (data.success) {
        allTrades = [];
        await loadTrades();
        await fetchPropFirmAccounts();
        alert("All data has been reset successfully.");
      } else {
        alert("Reset failed: " + (data.message || "unknown error"));
      }
    } catch (err) {
      alert("Reset failed: " + err.message);
    }
  }
}

// ============================================================
// DONATION / SUPPORT SECTION
// ============================================================
async function loadDonationInfo() {
  try {
    const res = await fetch('/api/donation');
    const data = await res.json();
    if (data.success) {
      const addrEl = document.getElementById('donation-address');
      const qrEl = document.getElementById('donation-qr');
      if (addrEl) addrEl.innerText = data.address;
      if (qrEl) qrEl.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(data.address)}`;
    }
  } catch (err) {
    console.error('Donation info fetch failed:', err);
  }
}

function copyDonationAddress() {
  const addrEl = document.getElementById('donation-address');
  if (!addrEl) return;
  const text = addrEl.innerText;
  navigator.clipboard.writeText(text).then(() => {
    const msg = document.getElementById('donation-copied-msg');
    if (msg) {
      msg.classList.remove('hidden');
      setTimeout(() => msg.classList.add('hidden'), 2000);
    }
  }).catch(() => {
    alert('Could not copy automatically — address: ' + text);
  });
}

// ============================================================
// ADVERTISEMENTS (user-facing display)
// ============================================================
async function fetchAds() {
  try {
    const res = await fetch('/api/ads');
    const data = await res.json();
    const container = document.getElementById('ads-container');
    if (!container) return;
    if (data.success && data.ads && data.ads.length) {
      container.innerHTML = data.ads.map(ad => `
        <div class="ad-card">
          <span class="ad-badge">Advertisement</span>
          ${ad.imageData ? `<img src="${ad.imageData}" alt="${escapeHtml(ad.title)}" class="ad-image">` : ''}
          <div class="ad-title">${escapeHtml(ad.title)}</div>
          ${ad.company ? `<div class="ad-company">${escapeHtml(ad.company)}</div>` : ''}
          ${ad.description ? `<div class="ad-description">${escapeHtml(ad.description)}</div>` : ''}
          ${ad.destinationUrl ? `<a href="${ad.destinationUrl}" target="_blank" rel="noopener noreferrer sponsored" class="btn ad-cta">${escapeHtml(ad.ctaText || 'Learn More')}</a>` : ''}
        </div>
      `).join('');
      container.classList.remove('hidden');
    } else if (container) {
      container.classList.add('hidden');
      container.innerHTML = '';
    }
  } catch (err) {
    console.error('Ad fetch failed:', err);
  }
}

// ============================================================
// ADMIN DASHBOARD
// ============================================================
function openAdminDashboard() {
  const modal = document.getElementById('admin-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  switchAdminSection('overview');
}

function closeAdminDashboard() {
  const modal = document.getElementById('admin-modal');
  if (modal) modal.classList.add('hidden');
}

function switchAdminSection(section) {
  adminSection = section;
  document.querySelectorAll('.admin-nav-btn').forEach(b => b.classList.toggle('active', b.dataset.section === section));
  document.querySelectorAll('.admin-panel-section').forEach(p => p.classList.add('hidden'));
  const target = document.getElementById(`admin-section-${section}`);
  if (target) target.classList.remove('hidden');

  if (section === 'overview') loadAdminOverview();
  else if (section === 'users') loadAdminUsers();
  else if (section === 'trades') loadAdminTrades();
  else if (section === 'ads') loadAdminAds();
}

async function loadAdminOverview() {
  const el = document.getElementById('admin-overview-grid');
  if (!el) return;
  try {
    const res = await fetch('/api/admin/overview');
    const data = await res.json();
    if (!data.success) { el.innerHTML = `<div class="empty-state">${escapeHtml(data.message || 'Access denied.')}</div>`; return; }
    const o = data.overview;
    el.innerHTML = `
      <div class="stat-card"><h4>Total Users</h4><div class="stat-value num">${o.totalUsers}</div></div>
      <div class="stat-card"><h4>Total Trades</h4><div class="stat-value num">${o.totalTrades}</div></div>
      <div class="stat-card"><h4>Platform Win Rate</h4><div class="stat-value num">${o.winRate}%</div></div>
      <div class="stat-card"><h4>Wins / Losses / BE</h4><div class="stat-value num" style="font-size:1.1rem;">${o.wins} / ${o.losses} / ${o.breakevens}</div></div>
      <div class="stat-card"><h4>Most Traded Pair</h4><div class="stat-value" style="font-size:1.1rem;">${escapeHtml(o.mostTradedPair || '—')}</div></div>
      <div class="stat-card"><h4>Most Active User</h4><div class="stat-value" style="font-size:1.1rem;">${o.mostActiveUser ? escapeHtml(o.mostActiveUser.username) + ' (' + o.mostActiveUser.trades + ')' : '—'}</div></div>
      <div class="stat-card"><h4>Average Risk</h4><div class="stat-value num">$${o.avgRisk}</div></div>
      <div class="stat-card"><h4>Total P/L</h4><div class="stat-value num" style="color:${o.totalPL >= 0 ? 'var(--win)' : 'var(--loss)'};">${o.totalPL >= 0 ? '+' : ''}$${o.totalPL}</div></div>
      <div class="stat-card"><h4>Active Ads</h4><div class="stat-value num">${o.activeAds}</div></div>
      <div class="stat-card"><h4>Trades Today</h4><div class="stat-value num">${o.tradesToday}</div></div>
      <div class="stat-card"><h4>New Users Today</h4><div class="stat-value num">${o.usersToday}</div></div>
    `;
  } catch (err) {
    el.innerHTML = `<div class="empty-state">Failed to load overview: ${escapeHtml(err.message)}</div>`;
  }
}

async function loadAdminUsers() {
  const el = document.getElementById('admin-users-list');
  if (!el) return;
  try {
    const res = await fetch('/api/admin/users');
    const data = await res.json();
    if (!data.success) { el.innerHTML = `<div class="empty-state">${escapeHtml(data.message || 'Access denied.')}</div>`; return; }
    adminUsersCache = data.users;
    el.innerHTML = data.users.map(u => `
      <div class="trade-row" onclick="viewUserPerformance('${u.id}')">
        <div class="trade-row-left">
          <div class="trade-row-info">
            <div class="trade-pair">${escapeHtml(u.username)} ${u.role === 'admin' ? '<span class="trade-account-tag">ADMIN</span>' : ''}</div>
            <div class="trade-meta">${escapeHtml(u.email)} · Joined ${formatDate(u.createdAt)} · ${u.totalTrades} trades · ${u.winRate}% win rate${u.hasGoogleAuth ? ' · Google' : ''}</div>
          </div>
        </div>
      </div>
    `).join('') || '<div class="empty-state">No users found.</div>';
  } catch (err) {
    el.innerHTML = `<div class="empty-state">Failed to load users: ${escapeHtml(err.message)}</div>`;
  }
}

async function viewUserPerformance(userId) {
  const modal = document.getElementById('admin-user-modal');
  const body = document.getElementById('admin-user-modal-body');
  if (!modal || !body) return;
  body.innerHTML = 'Loading...';
  modal.classList.remove('hidden');
  try {
    const res = await fetch(`/api/admin/users/${userId}/performance`);
    const data = await res.json();
    if (!data.success) { body.innerHTML = `<div class="empty-state">${escapeHtml(data.message)}</div>`; return; }
    const p = data.performance;
    body.innerHTML = `
      <h3 style="margin-bottom:10px;">${escapeHtml(data.user.username)}</h3>
      <div class="modal-grid">
        <div><div class="modal-field-label">Total Trades</div><div class="modal-field-value num">${p.totalTrades}</div></div>
        <div><div class="modal-field-label">Win Rate</div><div class="modal-field-value num">${p.winRate}%</div></div>
        <div><div class="modal-field-label">Wins</div><div class="modal-field-value num">${p.wins}</div></div>
        <div><div class="modal-field-label">Losses</div><div class="modal-field-value num">${p.losses}</div></div>
        <div><div class="modal-field-label">Break-even</div><div class="modal-field-value num">${p.breakevens}</div></div>
        <div><div class="modal-field-label">Average Risk</div><div class="modal-field-value num">$${p.avgRisk}</div></div>
        <div><div class="modal-field-label">Total P/L</div><div class="modal-field-value num" style="color:${p.totalPL >= 0 ? 'var(--win)' : 'var(--loss)'};">${p.totalPL >= 0 ? '+' : ''}$${p.totalPL}</div></div>
      </div>
      <div id="admin-user-trades"></div>
    `;
    const tradesEl = document.getElementById('admin-user-trades');
    tradesEl.innerHTML = data.trades.map(t => `
      <div class="trade-row" style="cursor:default;">
        <div class="trade-row-left">
          <span class="trade-dir-pill ${t.direction === 'Sell' ? 'sell' : 'buy'}">${t.direction === 'Sell' ? 'SELL' : 'BUY'}</span>
          <div class="trade-row-info">
            <div class="trade-pair">${escapeHtml(t.pair)}</div>
            <div class="trade-meta">Entry ${fmt(t.entry)} → Exit ${fmt(t.exit)} · ${formatDate(t.createdAt)}${t.chartScreenshot ? ' · 📷 has screenshot' : ''}</div>
          </div>
        </div>
        <span class="trade-outcome-tag ${t.outcome}">${labelOutcome(t.outcome)}</span>
      </div>
    `).join('') || '<div class="empty-state">No trades.</div>';
  } catch (err) {
    body.innerHTML = `<div class="empty-state">Failed to load: ${escapeHtml(err.message)}</div>`;
  }
}

function closeAdminUserModal() {
  const modal = document.getElementById('admin-user-modal');
  if (modal) modal.classList.add('hidden');
}

async function loadAdminTrades() {
  const el = document.getElementById('admin-trades-list');
  if (!el) return;
  const params = new URLSearchParams();
  const u = document.getElementById('admin-trade-filter-user');
  const p = document.getElementById('admin-trade-filter-pair');
  const o = document.getElementById('admin-trade-filter-outcome');
  if (u && u.value) params.set('username', u.value);
  if (p && p.value) params.set('pair', p.value);
  if (o && o.value && o.value !== 'All') params.set('outcome', o.value);

  try {
    const res = await fetch('/api/admin/trades?' + params.toString());
    const data = await res.json();
    if (!data.success) { el.innerHTML = `<div class="empty-state">${escapeHtml(data.message || 'Access denied.')}</div>`; return; }
    adminTradesCache = data.trades;
    el.innerHTML = data.trades.map(t => `
      <div class="trade-row" style="cursor:default;">
        <div class="trade-row-left">
          <span class="trade-dir-pill ${t.direction === 'Sell' ? 'sell' : 'buy'}">${t.direction === 'Sell' ? 'SELL' : 'BUY'}</span>
          <div class="trade-row-info">
            <div class="trade-pair">${escapeHtml(t.pair)} <span class="trade-account-tag">${escapeHtml(t.username)}</span></div>
            <div class="trade-meta">Entry ${fmt(t.entry)} → Exit ${fmt(t.exit)} · ${formatDate(t.createdAt)}${t.riskAmount ? ' · Risk $' + t.riskAmount : ''}${t.chartScreenshot ? ` · <a href="#" class="view-chart-link" data-trade-id="${t._id}">view chart</a>` : ''}</div>
          </div>
        </div>
        <span class="trade-outcome-tag ${t.outcome}">${labelOutcome(t.outcome)}</span>
      </div>
    `).join('') || '<div class="empty-state">No trades match.</div>';

    // Event delegation avoids quote-escaping issues from embedding IDs in onclick attributes.
    el.querySelectorAll('.view-chart-link').forEach(link => {
      link.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        showAdminImage(link.dataset.tradeId);
      });
    });
  } catch (err) {
    el.innerHTML = `<div class="empty-state">Failed to load: ${escapeHtml(err.message)}</div>`;
  }
}

function showAdminImage(tradeId) {
  const t = adminTradesCache.find(x => x._id === tradeId);
  if (!t || !t.chartScreenshot) return;
  const modal = document.getElementById('admin-user-modal');
  const body = document.getElementById('admin-user-modal-body');
  if (!modal || !body) return;
  body.innerHTML = `<h3 style="margin-bottom:10px;">${escapeHtml(t.pair)} — ${escapeHtml(t.username)}</h3><img src="${t.chartScreenshot}" class="screenshot-preview" alt="Chart screenshot">`;
  modal.classList.remove('hidden');
}

// ---------- ADMIN: ADVERTISEMENT MANAGEMENT ----------
async function loadAdminAds() {
  const el = document.getElementById('admin-ads-list');
  if (!el) return;
  try {
    const res = await fetch('/api/admin/ads');
    const data = await res.json();
    if (!data.success) { el.innerHTML = `<div class="empty-state">${escapeHtml(data.message || 'Access denied.')}</div>`; return; }
    adminAdsCache = data.ads;
    el.innerHTML = data.ads.map(ad => `
      <div class="trade-row" style="cursor:default;">
        <div class="trade-row-left">
          <div class="trade-row-info">
            <div class="trade-pair">${escapeHtml(ad.title)} ${ad.company ? '· ' + escapeHtml(ad.company) : ''}</div>
            <div class="trade-meta">Priority ${ad.priority} ${ad.destinationUrl ? '· ' + escapeHtml(ad.destinationUrl) : ''}</div>
          </div>
        </div>
        <div style="display:flex; gap:6px; align-items:center;">
          <span class="trade-outcome-tag ${ad.active ? 'Win' : 'Loss'}">${ad.active ? 'ACTIVE' : 'INACTIVE'}</span>
          <button class="btn" style="width:auto; padding:6px 10px; font-size:0.75rem; margin:0;" onclick="openAdModal('${ad._id}')">Edit</button>
          <button class="btn danger-btn" style="width:auto; padding:6px 10px; font-size:0.75rem; margin:0;" onclick="deleteAd('${ad._id}')">Delete</button>
        </div>
      </div>
    `).join('') || '<div class="empty-state">No advertisements yet.</div>';
  } catch (err) {
    el.innerHTML = `<div class="empty-state">Failed to load: ${escapeHtml(err.message)}</div>`;
  }
}

function openAdModal(adId) {
  const modal = document.getElementById('ad-modal');
  const form = document.getElementById('ad-form');
  if (!modal || !form) return;
  form.reset();
  document.getElementById('ad-edit-id').value = '';
  document.getElementById('adImageData').value = '';
  document.getElementById('adImagePreview').classList.add('hidden');
  document.getElementById('ad-modal-title').innerText = 'New Advertisement';

  if (adId) {
    const ad = adminAdsCache.find(a => a._id === adId);
    if (ad) {
      document.getElementById('ad-modal-title').innerText = 'Edit Advertisement';
      document.getElementById('ad-edit-id').value = ad._id;
      document.getElementById('ad-title').value = ad.title || '';
      document.getElementById('ad-company').value = ad.company || '';
      document.getElementById('ad-description').value = ad.description || '';
      document.getElementById('ad-url').value = ad.destinationUrl || '';
      document.getElementById('ad-cta').value = ad.ctaText || '';
      document.getElementById('ad-priority').value = ad.priority || 0;
      document.getElementById('ad-active').checked = !!ad.active;
      if (ad.imageData) {
        document.getElementById('adImageData').value = ad.imageData;
        const preview = document.getElementById('adImagePreview');
        preview.src = ad.imageData;
        preview.classList.remove('hidden');
      }
    }
  }
  modal.classList.remove('hidden');
}

function closeAdModal() {
  const modal = document.getElementById('ad-modal');
  if (modal) modal.classList.add('hidden');
}

async function submitAd(e) {
  e.preventDefault();
  const id = document.getElementById('ad-edit-id').value;
  const payload = {
    title: document.getElementById('ad-title').value,
    company: document.getElementById('ad-company').value,
    description: document.getElementById('ad-description').value,
    destinationUrl: document.getElementById('ad-url').value,
    ctaText: document.getElementById('ad-cta').value,
    priority: document.getElementById('ad-priority').value,
    active: document.getElementById('ad-active').checked,
    imageData: document.getElementById('adImageData').value || null
  };
  try {
    const res = await fetch(id ? `/api/admin/ads/${id}` : '/api/admin/ads', {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      closeAdModal();
      loadAdminAds();
    } else {
      alert(data.message || 'Could not save advertisement.');
    }
  } catch (err) {
    alert('Network error: ' + err.message);
  }
}

async function deleteAd(id) {
  if (!confirm('Delete this advertisement?')) return;
  try {
    const res = await fetch(`/api/admin/ads/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) loadAdminAds();
    else alert(data.message || 'Delete failed.');
  } catch (err) {
    alert('Network error: ' + err.message);
  }
}

// ============================================================
// SERVICE WORKER REGISTRATION (PWA / Android TWA support)
// Additive only — does not touch any existing app logic above.
// Auto-activates updates so users are never stuck on stale assets,
// without needing a manual "update available" prompt.
// ============================================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            newWorker.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      });
    }).catch((err) => console.error('Service worker registration failed:', err));
  });

  let refreshingAfterUpdate = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshingAfterUpdate) return;
    refreshingAfterUpdate = true;
    window.location.reload();
  });
}

// ============================================================
// PHASE 1 — TOAST NOTIFICATIONS FOR AUTO-CLOSED TRADES
// ============================================================
function showToast(trade) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const isWin = trade.outcome === 'Win';
  const rText = (trade.realizedR !== null && trade.realizedR !== undefined) ? `${trade.realizedR >= 0 ? '+' : ''}${trade.realizedR.toFixed(1)}R` : trade.exitReason;
  const toast = document.createElement('div');
  toast.className = 'toast' + (isWin ? '' : ' loss');
  toast.innerHTML = `<b>${isWin ? '🟢 Take Profit Hit' : '🔴 Stop Loss Hit'}</b><br>${escapeHtml(trade.pair)} ${escapeHtml(trade.direction)} closed at ${fmt(trade.exit)}.<br>Result: ${rText}`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 8000);
}

// ============================================================
// PHASE 1 — RECENT TRADES (Dashboard) & OPEN TRADES (Journal)
// ============================================================
function renderRecentTrades() {
  const el = document.getElementById('recent-trades-list');
  if (!el) return;
  const recent = allTrades.slice(0, 5);
  if (!recent.length) {
    el.innerHTML = '<div class="empty-state">No trades yet — use Analyze Trade above.</div>';
    return;
  }
  el.innerHTML = recent.map(t => `
    <div class="trade-row" onclick="openModal('${t._id}')">
      <div class="trade-row-left">
        <span class="trade-dir-pill ${t.direction === 'Sell' ? 'sell' : 'buy'}">${t.direction === 'Sell' ? 'SELL' : 'BUY'}</span>
        <div class="trade-row-info">
          <div class="trade-pair">${escapeHtml(t.pair)}</div>
          <div class="trade-meta">Entry ${fmt(t.entry)} · ${formatDate(t.createdAt)}</div>
        </div>
      </div>
      <span class="trade-outcome-tag ${t.outcome}">${labelOutcome(t.outcome)}</span>
    </div>
  `).join('');
}

function renderOpenTradesSection() {
  const el = document.getElementById('open-trades-section');
  const panel = document.getElementById('open-trades-panel');
  if (!el) return;
  const running = allTrades.filter(t => t.outcome === 'Running');
  if (!running.length) {
    if (panel) panel.classList.add('hidden');
    el.innerHTML = '';
    return;
  }
  if (panel) panel.classList.remove('hidden');

  el.innerHTML = running.map(t => {
    const key = normalizePairKey(t.pair);
    const livePrice = key ? getLivePrice(key) : null;
    const current = livePrice !== null ? livePrice : t.currentPrice;
    const currentDisplay = current !== null && current !== undefined ? formatMarketPrice(key, current) : (t.currentPrice ?? '—');

    let tpDistance = '—', slDistance = '—';
    if (current !== null && current !== undefined) {
      if (t.takeProfit) tpDistance = Math.abs(current - t.takeProfit).toFixed(5);
      if (t.stopLoss) slDistance = Math.abs(current - t.stopLoss).toFixed(5);
    }

    return `
      <div class="open-trade-card" onclick="openModal('${t._id}')">
        <div class="open-trade-header">
          <div>
            <span class="trade-dir-pill ${t.direction === 'Sell' ? 'sell' : 'buy'}">${t.direction === 'Sell' ? 'SELL' : 'BUY'}</span>
            <b style="margin-left:8px;">${escapeHtml(t.pair)}</b>
          </div>
          <span class="trade-outcome-tag Running">🟡 OPEN</span>
        </div>
        <div class="open-trade-grid">
          <div><div class="label">Entry</div><div class="value">${fmt(t.entry)}</div></div>
          <div><div class="label">Current</div><div class="value" style="color:var(--running);">${currentDisplay}</div></div>
          <div><div class="label">TP dist.</div><div class="value">${tpDistance}</div></div>
          <div><div class="label">SL dist.</div><div class="value">${slDistance}</div></div>
        </div>
      </div>
    `;
  }).join('');
}

// ============================================================
// PHASE 1 — AI MENTOR HISTORY & PROFILE
// ============================================================
function renderAiMentorHistory() {
  const el = document.getElementById('ai-mentor-history');
  if (!el) return;
  const withAnalysis = allTrades.filter(t => t.aiAnalysisText || t.aiStructured);
  if (!withAnalysis.length) {
    el.innerHTML = '<div class="empty-state">No AI analyses yet — analyze a trade from the Dashboard or Trade Journal.</div>';
    return;
  }
  el.innerHTML = withAnalysis.map(t => `
    <div class="panel" style="margin-bottom:12px; padding:16px;">
      <div class="panel-header-row" style="margin-bottom:8px;">
        <div>
          <span class="trade-dir-pill ${t.direction === 'Sell' ? 'sell' : 'buy'}">${t.direction === 'Sell' ? 'SELL' : 'BUY'}</span>
          <b style="margin-left:8px;">${escapeHtml(t.pair)}</b>
          <span style="color:var(--text-dim); font-size:0.78rem; margin-left:8px;">${formatDate(t.createdAt)}</span>
        </div>
        <span class="trade-outcome-tag ${t.outcome}">${labelOutcome(t.outcome)}</span>
      </div>
      ${renderAiResultHtml(t.aiAnalysisText, t.aiStructured)}
    </div>
  `).join('');
}

// ============================================================
// PHASE 2 — ENHANCED AI MENTOR: shared structured-result renderer
// ============================================================
const VERDICT_STYLE = {
  'Strong Setup': { color: 'var(--win)', bg: 'rgba(63,207,142,0.12)' },
  'Good Setup': { color: 'var(--win)', bg: 'rgba(63,207,142,0.08)' },
  'Neutral Setup': { color: 'var(--text-dim)', bg: 'var(--surface-alt)' },
  'Weak Setup': { color: 'var(--accent)', bg: 'var(--accent-soft)' },
  'Avoid': { color: 'var(--loss)', bg: 'rgba(239,90,90,0.12)' }
};

function scoreBarHtml(label, value) {
  if (value === null || value === undefined) return '';
  const v = Math.max(0, Math.min(100, value));
  const color = v >= 70 ? 'var(--win)' : v >= 45 ? 'var(--accent)' : 'var(--loss)';
  return `
    <div style="margin-bottom:8px;">
      <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--text-dim); margin-bottom:3px;">
        <span>${label}</span><span class="num">${v}/100</span>
      </div>
      <div class="guardrail-bar-bg" style="height:6px;">
        <div class="guardrail-bar-fill" style="width:${v}%; background:${color};"></div>
      </div>
    </div>
  `;
}

// Renders either the rich structured result (Phase 2) or falls back to the
// plain escaped text (Phase 1 trades / a JSON-parse miss) — never breaks
// display either way.
function renderAiResultHtml(rawText, structured) {
  if (!structured || !structured.verdict) {
    return `<div class="ai-box" style="margin-top:0;">${escapeHtml(rawText || '')}</div>`;
  }
  const style = VERDICT_STYLE[structured.verdict] || VERDICT_STYLE['Neutral Setup'];
  const scores = structured.scores || {};
  const sections = [
    ['What was done well', structured.whatWasDoneWell],
    ['What could improve', structured.whatCouldImprove],
    ['Risk concerns', structured.riskConcerns],
    ['Entry quality', structured.entryQuality],
    ['Stop-loss quality', structured.stopLossQuality],
    ['Take-profit quality', structured.takeProfitQuality],
    ['R:R quality', structured.rrQuality],
    ['Execution mistakes', structured.executionMistakes],
    ['Recommended improvement', structured.recommendedImprovement]
  ].filter(([, v]) => v);

  return `
    <div class="ai-structured">
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px; flex-wrap:wrap;">
        <span style="background:${style.bg}; color:${style.color}; padding:5px 14px; border-radius:20px; font-weight:700; font-size:0.85rem;">${escapeHtml(structured.verdict)}</span>
        ${scores.overall !== undefined && scores.overall !== null ? `<span class="num" style="color:var(--text-dim); font-size:0.82rem;">Overall score: <b style="color:${style.color};">${scores.overall}/100</b></span>` : ''}
      </div>
      ${structured.summary ? `<p style="font-size:0.88rem; line-height:1.55; margin-bottom:14px;">${escapeHtml(structured.summary)}</p>` : ''}
      <div class="propfirm-grid" style="margin-bottom:6px;">
        ${scoreBarHtml('Technical', scores.technical)}
        ${scoreBarHtml('Risk', scores.risk)}
        ${scoreBarHtml('Execution', scores.execution)}
        ${scoreBarHtml('Psychology', scores.psychology)}
      </div>
      ${sections.length ? `<details style="margin-top:10px;"><summary style="cursor:pointer; color:var(--accent); font-size:0.82rem; font-weight:600;">Full breakdown</summary>
        <div style="margin-top:10px;">
          ${sections.map(([label, val]) => `<div style="margin-bottom:10px;"><div class="modal-field-label">${escapeHtml(label)}</div><div style="font-size:0.85rem; line-height:1.5;">${escapeHtml(val)}</div></div>`).join('')}
        </div>
      </details>` : ''}
    </div>
  `;
}

function renderProfileView() {
  if (!currentUser) return;
  setText('profile-username', currentUser.username);
  setText('profile-email', currentUser.email);
  setText('profile-total', allTrades.length);
  const wins = allTrades.filter(t => t.outcome === 'Win').length;
  const losses = allTrades.filter(t => t.outcome === 'Loss').length;
  const decided = wins + losses;
  setText('profile-winrate', (decided > 0 ? ((wins / decided) * 100).toFixed(1) : '0.0') + '%');
  const metrics = computeAdvancedMetrics(allTrades);
  setText('profile-avgrr', metrics.avgRR + 'R');
  setText('profile-pf', metrics.profitFactor);
}

// ============================================================
// PHASE 1 — EXTENDED MARKETS PAGE
// ============================================================
const EXTENDED_TRACKED = ['EURUSD', 'USDCHF', 'AUDUSD', 'NZDUSD', 'EURGBP', 'EURJPY', 'GBPJPY', 'GBPCHF', 'AUDJPY', 'EURAUD', 'EURCAD', 'GBPAUD', 'ETHUSD'];

async function fetchExtendedMarket() {
  try {
    const res = await fetch('/api/market/extended');
    const data = await res.json();
    if (!data.success) return;
    latestExtendedMarket = data.data || {};
    if (!document.getElementById('view-markets').classList.contains('hidden')) renderMarketsPage();
  } catch (err) {
    console.error('Extended market fetch failed:', err);
  }
}

function marketCardHtml(key, label, m) {
  const price = m && m.price !== null && m.price !== undefined ? formatMarketPrice(key, m.price) : '—';
  let changeHtml = '<span class="market-change num">—</span>';
  if (m && m.change !== null && m.change !== undefined) {
    const up = m.change >= 0;
    changeHtml = `<span class="market-change num ${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${up ? '+' : ''}${m.change.toFixed(key === 'XAUUSD' || key === 'BTCUSD' || key === 'ETHUSD' ? 2 : 5)}</span>`;
  }
  const status = (m && m.status) || 'offline';
  return `
    <div class="market-card">
      <div class="market-symbol">${label}</div>
      <div class="market-price num">${price}</div>
      ${changeHtml}
      <div class="market-status ${status}"><span class="dot"></span>${status.toUpperCase()}</div>
    </div>
  `;
}

function renderMarketsPage() {
  const coreEl = document.getElementById('market-board-full');
  const extEl = document.getElementById('extended-market-board');
  if (coreEl) {
    coreEl.innerHTML = TRACKED.map(key => marketCardHtml(key, key === 'XAUUSD' ? 'GOLD' : key, latestMarket[key])).join('');
  }
  if (extEl) {
    extEl.innerHTML = EXTENDED_TRACKED.map(key => marketCardHtml(key, key, latestExtendedMarket[key])).join('');
  }
  let mostRecentCore = null;
  Object.values(latestMarket).forEach(m => { if (m && m.updatedAt && (!mostRecentCore || new Date(m.updatedAt) > mostRecentCore)) mostRecentCore = new Date(m.updatedAt); });
  let mostRecentExt = null;
  Object.values(latestExtendedMarket).forEach(m => { if (m && m.updatedAt && (!mostRecentExt || new Date(m.updatedAt) > mostRecentExt)) mostRecentExt = new Date(m.updatedAt); });
  setText('market-updated-full', mostRecentCore ? `Updated ${formatTime(mostRecentCore)}` : 'Awaiting first update');
  setText('extended-market-updated', mostRecentExt ? `Updated ${formatTime(mostRecentExt)}` : 'Awaiting first update');
}

// ============================================================
// PHASE 1 — RISK MANAGER (real calculations, no placeholders)
// ============================================================
function setupRiskCalculator() {
  const ids = ['risk-balance', 'risk-pct', 'risk-entry', 'risk-sl', 'risk-tp', 'risk-instrument'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el && !el.dataset.wired) {
      el.addEventListener('input', computeRiskManager);
      el.addEventListener('change', computeRiskManager);
      el.dataset.wired = '1';
    }
  });
}

function computeRiskManager() {
  const balance = parseFloat(document.getElementById('risk-balance').value);
  const pct = parseFloat(document.getElementById('risk-pct').value);
  const entry = parseFloat(document.getElementById('risk-entry').value);
  const sl = parseFloat(document.getElementById('risk-sl').value);
  const tp = parseFloat(document.getElementById('risk-tp').value);

  const banner = document.getElementById('risk-status-banner');

  if (isNaN(balance) || isNaN(pct) || isNaN(entry) || isNaN(sl)) {
    setText('risk-out-dollarrisk', '—'); setText('risk-out-distance', '—');
    setText('risk-out-loss', '—'); setText('risk-out-profit', '—');
    setText('risk-out-rr', '—'); setText('risk-out-status', '—');
    if (banner) banner.classList.add('hidden');
    return;
  }

  const dollarRisk = balance * (pct / 100);
  const distance = Math.abs(entry - sl);
  const potentialLoss = dollarRisk;
  let potentialProfit = null, rr = null;
  if (!isNaN(tp) && distance > 0) {
    const reward = Math.abs(tp - entry);
    rr = reward / distance;
    potentialProfit = dollarRisk * rr;
  }

  setText('risk-out-dollarrisk', '$' + dollarRisk.toFixed(2));
  setText('risk-out-distance', distance.toFixed(5));
  setText('risk-out-loss', '-$' + potentialLoss.toFixed(2));
  setText('risk-out-profit', potentialProfit !== null ? '+$' + potentialProfit.toFixed(2) : '—');
  setText('risk-out-rr', rr !== null ? '1:' + rr.toFixed(2) : '—');

  let status, statusClass, statusText;
  if (pct <= 1) { status = '🟢 Safe'; statusClass = 'caution'; statusText = `Risking ${pct.toFixed(2)}% — within a conservative range.`; }
  else if (pct <= 2) { status = '🟡 Caution'; statusClass = 'warning'; statusText = `Risking ${pct.toFixed(2)}% — on the higher end for a single trade.`; }
  else { status = '🔴 High Risk'; statusClass = 'breached'; statusText = `Risking ${pct.toFixed(2)}% — this exceeds typical risk-management guidelines.`; }

  setText('risk-out-status', status);
  if (banner) {
    banner.innerText = statusText;
    banner.className = 'propfirm-warning ' + statusClass;
    banner.classList.remove('hidden');
  }
}

// ============================================================
// PHASE 1 — POSITION SIZE CALCULATOR (real, currency-aware math)
// ============================================================
// Pip conventions: JPY-quoted pairs use 0.01, everything else in FX uses 0.0001.
function pipSizeFor(pair) {
  return pair.endsWith('JPY') ? 0.01 : 0.0001;
}

function setupPositionSizeCalculator() {
  const ids = ['pos-balance', 'pos-risk-pct', 'pos-instrument', 'pos-entry', 'pos-sl'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el && !el.dataset.wired) {
      el.addEventListener('input', computePositionSize);
      el.addEventListener('change', computePositionSize);
      el.dataset.wired = '1';
    }
  });
}

// Returns { pipValueUSD, note } for one standard lot (100,000 units) of `pair`,
// using live rates from the market caches where a cross-currency conversion is
// needed. Returns null pipValueUSD (with an explanatory note) rather than
// guessing when the required live rate isn't available yet.
function computePipValueUSD(pair, entryPrice) {
  const pip = pipSizeFor(pair);
  const STANDARD_LOT = 100000;
  const base = pair.slice(0, 3);
  const quote = pair.slice(3, 6);

  const liveRate = (key) => {
    const m = latestMarket[key] || latestExtendedMarket[key];
    return (m && m.price !== null && m.price !== undefined) ? m.price : null;
  };

  if (quote === 'USD') {
    // e.g. EURUSD, GBPUSD, AUDUSD, NZDUSD — quote currency IS USD, exact.
    return { pipValueUSD: STANDARD_LOT * pip, note: 'Exact — quote currency is USD.' };
  }
  if (base === 'USD') {
    // e.g. USDJPY, USDCHF, USDCAD — convert using the trade's own entry price.
    if (!entryPrice || entryPrice <= 0) return { pipValueUSD: null, note: 'Enter an entry price to compute pip value.' };
    return { pipValueUSD: (STANDARD_LOT * pip) / entryPrice, note: 'Converted using your entry price.' };
  }

  // Cross pair — needs a live USD rate for the quote currency.
  let conversionRate = null, conversionLabel = '';
  if (quote === 'JPY') { conversionRate = liveRate('USDJPY'); conversionLabel = 'USDJPY'; }
  else if (quote === 'GBP') { conversionRate = liveRate('GBPUSD'); conversionLabel = 'GBPUSD'; }
  else if (quote === 'AUD') { conversionRate = liveRate('AUDUSD'); conversionLabel = 'AUDUSD'; }
  else if (quote === 'CAD') { conversionRate = liveRate('USDCAD'); conversionLabel = 'USDCAD'; }
  else if (quote === 'CHF') { conversionRate = liveRate('USDCHF'); conversionLabel = 'USDCHF'; }

  if (conversionRate === null) {
    return { pipValueUSD: null, note: `Live ${conversionLabel} rate not available yet — cannot safely convert to USD. Try again once Markets has loaded, or check Settings for the refresh schedule.` };
  }

  const pipValueInQuote = STANDARD_LOT * pip;
  // If quote currency is USD-based (JPY, CAD, CHF quoted as USDXXX), divide; if it's XXXUSD-based (GBP, AUD), multiply.
  const pipValueUSD = (quote === 'JPY' || quote === 'CAD' || quote === 'CHF') ? pipValueInQuote / conversionRate : pipValueInQuote * conversionRate;
  return { pipValueUSD, note: `Converted using live ${conversionLabel} rate.` };
}

function computePositionSize() {
  const balance = parseFloat(document.getElementById('pos-balance').value);
  const pct = parseFloat(document.getElementById('pos-risk-pct').value);
  const instrument = document.getElementById('pos-instrument').value;
  const entry = parseFloat(document.getElementById('pos-entry').value);
  const sl = parseFloat(document.getElementById('pos-sl').value);
  const noteEl = document.getElementById('pos-conversion-note');

  if (isNaN(balance) || isNaN(pct) || isNaN(entry) || isNaN(sl) || entry === sl) {
    setText('pos-out-distance', '—'); setText('pos-out-dollarrisk', '—');
    setText('pos-out-size', '—'); setText('pos-out-pipvalue', '—');
    if (noteEl) noteEl.innerText = '';
    return;
  }

  const dollarRisk = balance * (pct / 100);
  const distance = Math.abs(entry - sl);
  setText('pos-out-dollarrisk', '$' + dollarRisk.toFixed(2));

  if (instrument === 'XAUUSD') {
    // Standard convention: 1 lot = 100 oz, so a $1 move = $100 P/L per lot.
    const dollarMovePerLot = 100 * distance;
    const lots = dollarMovePerLot > 0 ? dollarRisk / dollarMovePerLot : 0;
    setText('pos-out-distance', distance.toFixed(2) + ' (price units)');
    setText('pos-out-size', lots.toFixed(2) + ' lots (100oz/lot)');
    setText('pos-out-pipvalue', '$100 per $1 move, per lot');
    if (noteEl) noteEl.innerText = 'Gold sized using the standard 100oz-per-lot convention.';
    return;
  }

  if (instrument === 'BTCUSD' || instrument === 'ETHUSD') {
    // Retail crypto CFDs: position sized directly in coin units, no lot multiplier ambiguity.
    const units = distance > 0 ? dollarRisk / distance : 0;
    setText('pos-out-distance', distance.toFixed(2) + ' (USD price move)');
    setText('pos-out-size', units.toFixed(4) + ' coins');
    setText('pos-out-pipvalue', '$1 per $1 move, per coin');
    if (noteEl) noteEl.innerText = 'Crypto sized directly in coin units (linear USD P/L, no contract multiplier assumed).';
    return;
  }

  // Forex
  const pip = pipSizeFor(instrument);
  const distancePips = distance / pip;
  const { pipValueUSD, note } = computePipValueUSD(instrument, entry);
  if (noteEl) noteEl.innerText = note;

  if (pipValueUSD === null) {
    setText('pos-out-distance', distancePips.toFixed(1) + ' pips');
    setText('pos-out-size', 'Unavailable — see note above');
    setText('pos-out-pipvalue', '—');
    return;
  }

  const lots = distancePips > 0 ? dollarRisk / (distancePips * pipValueUSD) : 0;
  setText('pos-out-distance', distancePips.toFixed(1) + ' pips');
  setText('pos-out-size', lots.toFixed(2) + ' standard lots');
  setText('pos-out-pipvalue', '$' + pipValueUSD.toFixed(2) + '/pip/lot');
}

// ============================================================
// PHASE 2 — ADVANCED ANALYTICS
// ============================================================
let currentAnalyticsBreakdown = 'pair';

function getAnalyticsRangeTrades() {
  const rangeSel = document.getElementById('analytics-range');
  const range = rangeSel ? rangeSel.value : 'all';
  let cutoff = null;
  if (range !== 'all') {
    cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - parseInt(range, 10));
  }
  return allTrades.filter(t => {
    if (t.outcome !== 'Win' && t.outcome !== 'Loss' && t.outcome !== 'BreakEven') return false;
    if (!cutoff) return true;
    const d = new Date(t.closedAt || t.createdAt);
    return d >= cutoff;
  }).sort((a, b) => new Date(a.closedAt || a.createdAt) - new Date(b.closedAt || b.createdAt));
}

function computePerformanceStats(trades) {
  const decided = trades.filter(t => t.outcome === 'Win' || t.outcome === 'Loss');
  const wins = decided.filter(t => t.outcome === 'Win');
  const losses = decided.filter(t => t.outcome === 'Loss');
  const withR = decided.filter(t => t.realizedR !== null && t.realizedR !== undefined);
  const withPL = decided.filter(t => t.realizedPL !== null && t.realizedPL !== undefined);

  const winRate = decided.length ? (wins.length / decided.length) * 100 : 0;
  const avgWinnerR = wins.filter(t => t.realizedR !== null && t.realizedR !== undefined);
  const avgLoserR = losses.filter(t => t.realizedR !== null && t.realizedR !== undefined);
  const avgWinR = avgWinnerR.length ? avgWinnerR.reduce((s, t) => s + t.realizedR, 0) / avgWinnerR.length : null;
  const avgLossR = avgLoserR.length ? avgLoserR.reduce((s, t) => s + t.realizedR, 0) / avgLoserR.length : null;
  const expectancyR = withR.length ? withR.reduce((s, t) => s + t.realizedR, 0) / withR.length : null;

  const grossWinR = withR.filter(t => t.realizedR > 0).reduce((s, t) => s + t.realizedR, 0);
  const grossLossR = Math.abs(withR.filter(t => t.realizedR < 0).reduce((s, t) => s + t.realizedR, 0));
  const profitFactor = grossLossR > 0 ? grossWinR / grossLossR : (grossWinR > 0 ? Infinity : 0);

  // Max drawdown & recovery factor from the cumulative-R equity curve.
  let cum = 0, peak = 0, maxDD = 0;
  withR.forEach(t => { cum += t.realizedR; if (cum > peak) peak = cum; const dd = peak - cum; if (dd > maxDD) maxDD = dd; });
  const netR = withR.reduce((s, t) => s + t.realizedR, 0);
  const recoveryFactor = maxDD > 0 ? netR / maxDD : (netR > 0 ? Infinity : 0);

  const bestTrade = withR.length ? Math.max(...withR.map(t => t.realizedR)) : null;
  const worstTrade = withR.length ? Math.min(...withR.map(t => t.realizedR)) : null;

  const withHoldTime = decided.filter(t => t.createdAt && t.closedAt);
  const avgHoldingMs = withHoldTime.length ? withHoldTime.reduce((s, t) => s + (new Date(t.closedAt) - new Date(t.createdAt)), 0) / withHoldTime.length : null;

  let maxWinStreak = 0, maxLossStreak = 0, curWin = 0, curLoss = 0;
  decided.forEach(t => {
    if (t.outcome === 'Win') { curWin++; curLoss = 0; if (curWin > maxWinStreak) maxWinStreak = curWin; }
    else { curLoss++; curWin = 0; if (curLoss > maxLossStreak) maxLossStreak = curLoss; }
  });

  const avgWinPL = withPL.filter(t => t.outcome === 'Win');
  const avgLossPL = withPL.filter(t => t.outcome === 'Loss');
  const avgWinnerDollar = avgWinPL.length ? avgWinPL.reduce((s, t) => s + t.realizedPL, 0) / avgWinPL.length : null;
  const avgLoserDollar = avgLossPL.length ? avgLossPL.reduce((s, t) => s + t.realizedPL, 0) / avgLossPL.length : null;

  return {
    totalClosed: decided.length, winRate, lossRate: 100 - winRate,
    avgWinR, avgLossR, expectancyR, profitFactor, maxDrawdownR: maxDD, recoveryFactor,
    bestTrade, worstTrade, avgHoldingMs, maxWinStreak, maxLossStreak,
    avgWinnerDollar, avgLoserDollar, hasDollarData: withPL.length > 0
  };
}

function formatHoldingTime(ms) {
  if (ms === null) return '—';
  const hours = ms / 3600000;
  if (hours < 1) return Math.round(ms / 60000) + 'm';
  if (hours < 48) return hours.toFixed(1) + 'h';
  return (hours / 24).toFixed(1) + 'd';
}

function renderAnalytics() {
  const trades = getAnalyticsRangeTrades();
  const s = computePerformanceStats(trades);
  const grid = document.getElementById('analytics-stats-grid');
  if (grid) {
    const pf = s.profitFactor === Infinity ? '∞' : s.profitFactor.toFixed(2);
    const rf = s.recoveryFactor === Infinity ? '∞' : s.recoveryFactor.toFixed(2);
    grid.innerHTML = `
      <div class="stat-card"><h4>Closed trades</h4><div class="stat-value num">${s.totalClosed}</div></div>
      <div class="stat-card"><h4>Win rate</h4><div class="stat-value num" style="color:var(--win);">${s.winRate.toFixed(1)}%</div></div>
      <div class="stat-card"><h4>Expectancy</h4><div class="stat-value num">${s.expectancyR !== null ? s.expectancyR.toFixed(2) + 'R' : '—'}</div></div>
      <div class="stat-card"><h4>Profit factor</h4><div class="stat-value num">${pf}</div></div>
      <div class="stat-card"><h4>Avg winner</h4><div class="stat-value num" style="color:var(--win);">${s.avgWinR !== null ? '+' + s.avgWinR.toFixed(2) + 'R' : '—'}</div></div>
      <div class="stat-card"><h4>Avg loser</h4><div class="stat-value num" style="color:var(--loss);">${s.avgLossR !== null ? s.avgLossR.toFixed(2) + 'R' : '—'}</div></div>
      <div class="stat-card"><h4>Max drawdown</h4><div class="stat-value num" style="color:var(--loss);">${s.maxDrawdownR.toFixed(2)}R</div></div>
      <div class="stat-card"><h4>Recovery factor</h4><div class="stat-value num">${rf}</div></div>
      <div class="stat-card"><h4>Best trade</h4><div class="stat-value num" style="color:var(--win);">${s.bestTrade !== null ? '+' + s.bestTrade.toFixed(2) + 'R' : '—'}</div></div>
      <div class="stat-card"><h4>Worst trade</h4><div class="stat-value num" style="color:var(--loss);">${s.worstTrade !== null ? s.worstTrade.toFixed(2) + 'R' : '—'}</div></div>
      <div class="stat-card"><h4>Avg hold time</h4><div class="stat-value num">${formatHoldingTime(s.avgHoldingMs)}</div></div>
      <div class="stat-card"><h4>Best/worst streak</h4><div class="stat-value num" style="font-size:1.1rem;">${s.maxWinStreak}W / ${s.maxLossStreak}L</div></div>
    `;
  }

  renderEquityChart(trades);
  renderDistributionChart(trades);
  renderBreakdownChart(trades);
}

function renderEquityChart(trades) {
  const container = document.getElementById('analytics-equity-chart');
  if (!container) return;
  const modeSel = document.getElementById('analytics-equity-mode');
  const mode = modeSel ? modeSel.value : 'R';

  const withR = trades.filter(t => t.realizedR !== null && t.realizedR !== undefined);
  const withPL = trades.filter(t => t.realizedPL !== null && t.realizedPL !== undefined);
  const source = mode === 'PL' ? withPL : withR;
  const valueKey = mode === 'PL' ? 'realizedPL' : 'realizedR';

  if (mode === 'PL' && !withPL.length) {
    container.innerHTML = '<div class="empty-state">No trades have a Realized P/L ($) entered yet for this range — showing R-multiples instead is available from the dropdown above.</div>';
    return;
  }
  if (!source.length) {
    container.innerHTML = '<div class="empty-state">Not enough closed trades in this range yet.</div>';
    return;
  }

  let cum = 0, peak = 0;
  const points = [{ x: 0, y: 0 }];
  const ddPoints = [{ x: 0, y: 0 }];
  source.forEach((t, i) => {
    cum += t[valueKey];
    if (cum > peak) peak = cum;
    points.push({ x: i + 1, y: cum });
    ddPoints.push({ x: i + 1, y: peak - cum });
  });

  const usePoints = mode === 'drawdown' ? ddPoints : points;
  const w = 640, h = 220, pad = 16;
  const ys = usePoints.map(p => p.y);
  const minY = Math.min(...ys, 0), maxY = Math.max(...ys, 0);
  const range = (maxY - minY) || 1;
  const stepX = (w - pad * 2) / (usePoints.length - 1 || 1);
  const toY = (v) => h - pad - ((v - minY) / range) * (h - pad * 2);
  const zeroY = toY(0).toFixed(1);

  const svgPoints = usePoints.map((p, i) => `${(pad + i * stepX).toFixed(1)},${toY(p.y).toFixed(1)}`).join(' ');
  const finalVal = usePoints[usePoints.length - 1].y;
  const lineColor = mode === 'drawdown' ? 'var(--loss)' : (finalVal >= 0 ? 'var(--win)' : 'var(--loss)');
  const unitLabel = mode === 'PL' ? '$' : 'R';

  container.innerHTML = `
    <svg viewBox="0 0 ${w} ${h}" style="width:100%; height:auto; display:block;">
      <line x1="${pad}" y1="${zeroY}" x2="${w - pad}" y2="${zeroY}" stroke="var(--border)" stroke-width="1"/>
      <polyline points="${svgPoints}" fill="none" stroke="${lineColor}" stroke-width="2"/>
    </svg>
    <div class="progress-labels"><span>${source.length} trades</span><span>${mode === 'drawdown' ? 'Max: ' + Math.max(...ddPoints.map(p => p.y)).toFixed(2) + unitLabel : 'Net: ' + (finalVal >= 0 ? '+' : '') + finalVal.toFixed(2) + unitLabel}</span></div>
  `;
}

function renderDistributionChart(trades) {
  const container = document.getElementById('analytics-distribution-chart');
  if (!container) return;
  const wins = trades.filter(t => t.outcome === 'Win').length;
  const losses = trades.filter(t => t.outcome === 'Loss').length;
  const breakevens = trades.filter(t => t.outcome === 'BreakEven').length;
  const max = Math.max(wins, losses, breakevens, 1);

  const bar = (label, count, color) => `
    <div style="margin-bottom:10px;">
      <div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-bottom:3px;"><span>${label}</span><span class="num">${count}</span></div>
      <div class="guardrail-bar-bg"><div class="guardrail-bar-fill" style="width:${(count / max) * 100}%; background:${color};"></div></div>
    </div>
  `;
  container.innerHTML = bar('Wins', wins, 'var(--win)') + bar('Losses', losses, 'var(--loss)') + bar('Break-even', breakevens, 'var(--text-dim)');
}

function switchAnalyticsBreakdown(type) {
  currentAnalyticsBreakdown = type;
  document.querySelectorAll('#analytics-breakdown-tabs .admin-nav-btn').forEach(b => b.classList.toggle('active', b.dataset.breakdown === type));
  renderBreakdownChart(getAnalyticsRangeTrades());
}

function groupKeyFor(trade, type) {
  if (type === 'pair') return trade.pair || 'Unknown';
  if (type === 'direction') return trade.direction || 'Unknown';
  if (type === 'session') return trade.session || 'Unspecified';
  if (type === 'dayofweek') return new Date(trade.closedAt || trade.createdAt).toLocaleDateString(undefined, { weekday: 'short' });
  if (type === 'month') return new Date(trade.closedAt || trade.createdAt).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
  return null; // 'strategy' handled separately (multi-tag)
}

function renderBreakdownChart(trades) {
  const chartEl = document.getElementById('analytics-breakdown-chart');
  const tableEl = document.getElementById('analytics-breakdown-table');
  if (!chartEl || !tableEl) return;

  const groups = {};
  const addToGroup = (key, trade) => {
    if (!groups[key]) groups[key] = { count: 0, wins: 0, losses: 0, rSum: 0, rCount: 0 };
    groups[key].count++;
    if (trade.outcome === 'Win') groups[key].wins++;
    if (trade.outcome === 'Loss') groups[key].losses++;
    if (trade.realizedR !== null && trade.realizedR !== undefined) { groups[key].rSum += trade.realizedR; groups[key].rCount++; }
  };

  if (currentAnalyticsBreakdown === 'strategy') {
    trades.forEach(t => {
      if (t.tags && t.tags.length) t.tags.forEach(tag => addToGroup(tag, t));
      else addToGroup('No tag', t);
    });
  } else {
    trades.forEach(t => addToGroup(groupKeyFor(t, currentAnalyticsBreakdown), t));
  }

  const entries = Object.entries(groups).sort((a, b) => b[1].count - a[1].count).slice(0, 10);
  if (!entries.length) {
    chartEl.innerHTML = '<div class="empty-state">No closed trades in this range yet.</div>';
    tableEl.innerHTML = '';
    return;
  }

  const maxCount = Math.max(...entries.map(([, g]) => g.count));
  chartEl.innerHTML = entries.map(([key, g]) => {
    const wr = (g.wins + g.losses) > 0 ? (g.wins / (g.wins + g.losses)) * 100 : 0;
    const color = wr >= 55 ? 'var(--win)' : wr >= 40 ? 'var(--accent)' : 'var(--loss)';
    return `
      <div style="margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-bottom:3px;">
          <span>${escapeHtml(key)}</span><span class="num">${g.count} trades · ${wr.toFixed(0)}% WR</span>
        </div>
        <div class="guardrail-bar-bg"><div class="guardrail-bar-fill" style="width:${(g.count / maxCount) * 100}%; background:${color};"></div></div>
      </div>
    `;
  }).join('');

  tableEl.innerHTML = `
    <div class="filter-bar" style="margin-top:14px; flex-wrap:wrap;">
      ${entries.map(([key, g]) => `<span class="trade-account-tag" style="font-size:0.72rem;">${escapeHtml(key)}: ${g.rCount ? (g.rSum / g.rCount >= 0 ? '+' : '') + (g.rSum / g.rCount).toFixed(2) + 'R avg' : 'no R data'}</span>`).join(' ')}
    </div>
  `;
}

// ============================================================
// PHASE 3 — DISCIPLINE SCORE (transparent, behavior-based, not profit-based)
// ============================================================
// Each criterion only counts trades where the user actually answered that
// specific question. If nobody has ever logged e.g. "moved stop loss" data,
// that category is excluded entirely and its weight is redistributed across
// the categories that DO have data — so a user who hasn't started logging
// psychology yet doesn't get a misleadingly low (or high) score from
// categories with zero real answers.
const DISCIPLINE_WEIGHTS = {
  followedPlan: 25,
  avoidedRevengeTrading: 20,
  respectedStopLoss: 20,
  avoidedOverleverage: 15,
  journalingConsistency: 10,
  avoidedOvertrading: 10
};

function computeDisciplineScore(trades) {
  const closed = trades.filter(t => t.outcome === 'Win' || t.outcome === 'Loss' || t.outcome === 'BreakEven');
  const categories = {};

  const boolCategory = (field, wantValue) => {
    const answered = closed.filter(t => t.psychology && t.psychology[field] !== null && t.psychology[field] !== undefined);
    if (!answered.length) return { applicable: false, fraction: null, answered: 0 };
    const matching = answered.filter(t => t.psychology[field] === wantValue).length;
    return { applicable: true, fraction: matching / answered.length, answered: answered.length };
  };

  categories.followedPlan = boolCategory('followedPlan', true);
  categories.avoidedRevengeTrading = boolCategory('revengeTraded', false);
  categories.respectedStopLoss = boolCategory('movedStopLoss', false);
  categories.avoidedOverleverage = boolCategory('overLeveraged', false);

  // Journaling consistency: always applicable as long as there are closed trades.
  if (closed.length) {
    const withNotes = closed.filter(t => t.notes && t.notes.trim().length > 0).length;
    categories.journalingConsistency = { applicable: true, fraction: withNotes / closed.length, answered: closed.length };
  } else {
    categories.journalingConsistency = { applicable: false, fraction: null, answered: 0 };
  }

  // Overtrading: needs at least 2 distinct trading days to have a median to compare against.
  const dayCounts = {};
  closed.forEach(t => {
    const day = new Date(t.closedAt || t.createdAt).toISOString().slice(0, 10);
    dayCounts[day] = (dayCounts[day] || 0) + 1;
  });
  const dayValues = Object.values(dayCounts);
  if (dayValues.length >= 2) {
    const sorted = [...dayValues].sort((a, b) => a - b);
    // FIX: for an even-length array, sorted[floor(len/2)] picks the upper of
    // the two middle values, not the true median — with exactly 2 trading
    // days this made the busier day effectively define its own threshold,
    // so overtrading could almost never be detected. Proper median: average
    // the two middle values for even length, take the exact middle for odd.
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    const overtradingDays = dayValues.filter(c => c > median * 2).length;
    categories.avoidedOvertrading = { applicable: true, fraction: 1 - (overtradingDays / dayValues.length), answered: dayValues.length };
  } else {
    categories.avoidedOvertrading = { applicable: false, fraction: null, answered: 0 };
  }

  const applicableWeightSum = Object.keys(categories).reduce((s, k) => s + (categories[k].applicable ? DISCIPLINE_WEIGHTS[k] : 0), 0);
  let score = null;
  if (applicableWeightSum > 0) {
    const weightedSum = Object.keys(categories).reduce((s, k) => s + (categories[k].applicable ? categories[k].fraction * DISCIPLINE_WEIGHTS[k] : 0), 0);
    score = (weightedSum / applicableWeightSum) * 100;
  }

  return { score, categories, applicableWeightSum, totalPossibleWeight: Object.values(DISCIPLINE_WEIGHTS).reduce((a, b) => a + b, 0) };
}

const DISCIPLINE_LABELS = {
  followedPlan: 'Followed trading plan',
  avoidedRevengeTrading: 'Avoided revenge trading',
  respectedStopLoss: "Didn't move stop loss",
  avoidedOverleverage: 'Avoided over-leveraging',
  journalingConsistency: 'Journaling consistency',
  avoidedOvertrading: 'Avoided overtrading'
};

function renderPsychologyView() {
  renderDisciplineScore();
  renderPsychAverages();
  renderPsychCorrelations();
}

function renderDisciplineScore() {
  const el = document.getElementById('discipline-score-display');
  if (!el) return;
  const result = computeDisciplineScore(allTrades);

  if (result.score === null) {
    el.innerHTML = '<div class="empty-state">No psychology data logged yet. Fill in the "Psychology check-in" section when logging a trade in the Trade Journal to start building your discipline score.</div>';
    return;
  }

  const scoreColor = result.score >= 75 ? 'var(--win)' : result.score >= 50 ? 'var(--accent)' : 'var(--loss)';
  const rows = Object.keys(result.categories).map(key => {
    const c = result.categories[key];
    if (!c.applicable) {
      return `<div style="margin-bottom:10px; opacity:0.5;"><div style="display:flex; justify-content:space-between; font-size:0.8rem;"><span>${DISCIPLINE_LABELS[key]}</span><span>No data logged</span></div></div>`;
    }
    const pct = (c.fraction * 100).toFixed(0);
    const color = c.fraction >= 0.75 ? 'var(--win)' : c.fraction >= 0.5 ? 'var(--accent)' : 'var(--loss)';
    return `
      <div style="margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-bottom:3px;"><span>${DISCIPLINE_LABELS[key]}</span><span class="num">${pct}% (${c.answered} trades, weight ${DISCIPLINE_WEIGHTS[key]})</span></div>
        <div class="guardrail-bar-bg"><div class="guardrail-bar-fill" style="width:${pct}%; background:${color};"></div></div>
      </div>
    `;
  }).join('');

  el.innerHTML = `
    <div style="text-align:center; margin-bottom:20px;">
      <div class="num" style="font-size:2.4rem; font-weight:700; color:${scoreColor};">${result.score.toFixed(0)}/100</div>
      <div style="font-size:0.78rem; color:var(--text-dim);">Based on ${result.applicableWeightSum}/${result.totalPossibleWeight} weighted points of logged data</div>
    </div>
    ${rows}
  `;
}

function renderPsychAverages() {
  const el = document.getElementById('psych-averages');
  if (!el) return;
  const withPsych = allTrades.filter(t => t.psychology && Object.values(t.psychology).some(v => v !== null && v !== undefined));
  if (!withPsych.length) {
    el.innerHTML = '<div class="empty-state">No pre-trade check-ins logged yet.</div>';
    return;
  }
  const avg = (field) => {
    const vals = withPsych.filter(t => t.psychology[field] !== null && t.psychology[field] !== undefined).map(t => t.psychology[field]);
    return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  };
  const fields = [['confidence', 'Confidence'], ['fear', 'Fear'], ['fomo', 'FOMO'], ['patience', 'Patience'], ['revengeUrge', 'Revenge urge']];
  el.innerHTML = fields.map(([key, label]) => {
    const a = avg(key);
    if (a === null) return '';
    return `
      <div style="margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-bottom:3px;"><span>${label}</span><span class="num">${a.toFixed(1)}/10</span></div>
        <div class="guardrail-bar-bg"><div class="guardrail-bar-fill" style="width:${a * 10}%; background:var(--accent);"></div></div>
      </div>
    `;
  }).join('') + `<p class="panel-sub" style="margin-top:10px;">Averaged across ${withPsych.length} trade(s) with a logged check-in.</p>`;
}

function renderPsychCorrelations() {
  const el = document.getElementById('psych-correlations');
  if (!el) return;
  const MIN_GROUP_SIZE = 5;
  const closed = allTrades.filter(t => (t.outcome === 'Win' || t.outcome === 'Loss') && t.psychology);
  const insights = [];

  const winRateOf = (arr) => {
    const decided = arr.filter(t => t.outcome === 'Win' || t.outcome === 'Loss');
    return decided.length ? (arr.filter(t => t.outcome === 'Win').length / decided.length) * 100 : null;
  };

  // FOMO high (>=7) vs low (<7)
  const fomoHigh = closed.filter(t => t.psychology.fomo !== null && t.psychology.fomo >= 7);
  const fomoLow = closed.filter(t => t.psychology.fomo !== null && t.psychology.fomo < 7);
  if (fomoHigh.length >= MIN_GROUP_SIZE && fomoLow.length >= MIN_GROUP_SIZE) {
    insights.push(`Win rate is <b>${winRateOf(fomoHigh).toFixed(0)}%</b> when FOMO is rated 7+ vs <b>${winRateOf(fomoLow).toFixed(0)}%</b> when it's lower (${fomoHigh.length} vs ${fomoLow.length} trades).`);
  }

  // Followed plan vs not
  const followed = closed.filter(t => t.psychology.followedPlan === true);
  const notFollowed = closed.filter(t => t.psychology.followedPlan === false);
  if (followed.length >= MIN_GROUP_SIZE && notFollowed.length >= MIN_GROUP_SIZE) {
    insights.push(`Win rate is <b>${winRateOf(followed).toFixed(0)}%</b> when you followed your plan vs <b>${winRateOf(notFollowed).toFixed(0)}%</b> when you didn't (${followed.length} vs ${notFollowed.length} trades).`);
  }

  // Revenge traded vs not
  const revenge = closed.filter(t => t.psychology.revengeTraded === true);
  const noRevenge = closed.filter(t => t.psychology.revengeTraded === false);
  if (revenge.length >= MIN_GROUP_SIZE && noRevenge.length >= MIN_GROUP_SIZE) {
    insights.push(`Win rate on revenge trades is <b>${winRateOf(revenge).toFixed(0)}%</b> vs <b>${winRateOf(noRevenge).toFixed(0)}%</b> on trades where you didn't revenge trade (${revenge.length} vs ${noRevenge.length} trades).`);
  }

  // Confidence high vs low
  const confHigh = closed.filter(t => t.psychology.confidence !== null && t.psychology.confidence >= 7);
  const confLow = closed.filter(t => t.psychology.confidence !== null && t.psychology.confidence < 7);
  if (confHigh.length >= MIN_GROUP_SIZE && confLow.length >= MIN_GROUP_SIZE) {
    insights.push(`Win rate is <b>${winRateOf(confHigh).toFixed(0)}%</b> on high-confidence (7+) trades vs <b>${winRateOf(confLow).toFixed(0)}%</b> on lower-confidence trades (${confHigh.length} vs ${confLow.length} trades).`);
  }

  if (!insights.length) {
    el.innerHTML = `<div class="empty-state">Not enough data yet for reliable correlations — each comparison needs at least ${MIN_GROUP_SIZE} closed trades in both groups. Keep logging psychology check-ins.</div>`;
    return;
  }
  el.innerHTML = insights.map(i => `<div class="propfirm-warning caution" style="border-color:var(--accent);">${i}</div>`).join('');
}

// ============================================================
// PHASE 3 — TRADE CALENDAR
// ============================================================
let calendarViewDate = new Date();

function shiftCalendarMonth(delta) {
  calendarViewDate.setMonth(calendarViewDate.getMonth() + delta);
  renderTradeCalendar();
}

function computeDayStats(trades, dateKey) {
  const dayTrades = trades.filter(t => {
    const d = new Date(t.closedAt || t.createdAt);
    return (t.outcome === 'Win' || t.outcome === 'Loss' || t.outcome === 'BreakEven') && d.toISOString().slice(0, 10) === dateKey;
  });
  const wins = dayTrades.filter(t => t.outcome === 'Win').length;
  const losses = dayTrades.filter(t => t.outcome === 'Loss').length;
  const decided = wins + losses;
  const withR = dayTrades.filter(t => t.realizedR !== null && t.realizedR !== undefined);
  const netR = withR.reduce((s, t) => s + t.realizedR, 0);
  const withPL = dayTrades.filter(t => t.realizedPL !== null && t.realizedPL !== undefined);
  const netPL = withPL.reduce((s, t) => s + t.realizedPL, 0);
  return {
    count: dayTrades.length, wins, losses,
    winRate: decided > 0 ? (wins / decided) * 100 : null,
    netR: withR.length ? netR : null,
    netPL: withPL.length ? netPL : null,
    trades: dayTrades
  };
}

function renderTradeCalendar() {
  const label = document.getElementById('calendar-month-label');
  const daysEl = document.getElementById('calendar-days');
  if (!label || !daysEl) return;

  const year = calendarViewDate.getFullYear();
  const month = calendarViewDate.getMonth();
  label.innerText = calendarViewDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = new Date().toISOString().slice(0, 10);

  let html = '';
  for (let i = 0; i < startWeekday; i++) html += '<div class="calendar-day empty"></div>';

  for (let day = 1; day <= daysInMonth; day++) {
    const dateObj = new Date(year, month, day);
    const dateKey = dateObj.toISOString().slice(0, 10);
    const stats = computeDayStats(allTrades, dateKey);

    let cls = 'calendar-day';
    let dot = '⚪';
    if (stats.count > 0) {
      const netMetric = stats.netPL !== null ? stats.netPL : stats.netR;
      if (netMetric !== null && netMetric > 0) { cls += ' profitable'; dot = '🟢'; }
      else if (netMetric !== null && netMetric < 0) { cls += ' losing'; dot = '🔴'; }
    }
    if (dateKey === todayKey) cls += ' today';

    const plLabel = stats.count === 0 ? '' : (stats.netPL !== null ? `${stats.netPL >= 0 ? '+' : ''}$${stats.netPL.toFixed(0)}` : (stats.netR !== null ? `${stats.netR >= 0 ? '+' : ''}${stats.netR.toFixed(1)}R` : ''));

    html += `
      <div class="${cls}" onclick="showCalendarDayDetail('${dateKey}')">
        <span class="day-num">${day}</span>
        ${stats.count > 0 ? `<span class="day-dot">${dot} ${stats.count}</span><span class="day-pl">${plLabel}</span>` : ''}
      </div>
    `;
  }
  daysEl.innerHTML = html;
}

function showCalendarDayDetail(dateKey) {
  const panel = document.getElementById('calendar-day-detail-panel');
  const title = document.getElementById('calendar-day-detail-title');
  const statsEl = document.getElementById('calendar-day-stats');
  const tradesEl = document.getElementById('calendar-day-trades');
  if (!panel) return;

  const stats = computeDayStats(allTrades, dateKey);
  title.innerText = new Date(dateKey + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  if (!stats.count) {
    statsEl.innerHTML = '';
    tradesEl.innerHTML = '<div class="empty-state">No closed trades on this day.</div>';
  } else {
    statsEl.innerHTML = `
      <div><div class="modal-field-label">Trades</div><div class="modal-field-value num">${stats.count}</div></div>
      <div><div class="modal-field-label">Win rate</div><div class="modal-field-value num">${stats.winRate !== null ? stats.winRate.toFixed(0) + '%' : '—'}</div></div>
      <div><div class="modal-field-label">Net R</div><div class="modal-field-value num" style="color:${stats.netR >= 0 ? 'var(--win)' : 'var(--loss)'};">${stats.netR !== null ? (stats.netR >= 0 ? '+' : '') + stats.netR.toFixed(2) + 'R' : '—'}</div></div>
      <div><div class="modal-field-label">Net P/L</div><div class="modal-field-value num" style="color:${stats.netPL >= 0 ? 'var(--win)' : 'var(--loss)'};">${stats.netPL !== null ? (stats.netPL >= 0 ? '+' : '') + '$' + stats.netPL.toFixed(2) : '—'}</div></div>
    `;
    tradesEl.innerHTML = stats.trades.map(t => `
      <div class="trade-row" onclick="openModal('${t._id}')">
        <div class="trade-row-left">
          <span class="trade-dir-pill ${t.direction === 'Sell' ? 'sell' : 'buy'}">${t.direction === 'Sell' ? 'SELL' : 'BUY'}</span>
          <div class="trade-row-info">
            <div class="trade-pair">${escapeHtml(t.pair)}</div>
            <div class="trade-meta">Entry ${fmt(t.entry)} → Exit ${fmt(t.exit)}</div>
          </div>
        </div>
        <span class="trade-outcome-tag ${t.outcome}">${labelOutcome(t.outcome)}</span>
      </div>
    `).join('');
  }
  panel.style.display = 'block';
}

// ============================================================
// PHASE 4 — ECONOMIC CALENDAR (Financial Modeling Prep)
// ============================================================
const ECONCAL_CURRENCIES = ['USD', 'GBP', 'EUR', 'JPY', 'CAD', 'AUD', 'NZD', 'CHF'];
let econCalConfigured = false;
let econCalStatus = 'offline';
let econCalLastUpdated = null;

async function fetchEconomicCalendarData() {
  try {
    const res = await fetch('/api/economic-calendar');
    const data = await res.json();
    if (!data.success) return;
    econCalConfigured = data.configured;
    econCalStatus = data.status;
    econCalLastUpdated = data.lastUpdated ? new Date(data.lastUpdated) : null;
    // Scope to the 8 currencies this app tracks — events FMP returns for
    // other countries are real too, just outside what this app covers, so
    // they're excluded here rather than shown unlabeled.
    latestEconomicEvents = (data.events || []).filter(e => e.currency && ECONCAL_CURRENCIES.includes(e.currency));

    if (!document.getElementById('view-economic-calendar').classList.contains('hidden')) renderEconomicCalendar();
  } catch (err) {
    console.error('Economic calendar fetch failed:', err);
  }
}

function impactColor(impact) {
  if (impact === 'High') return 'var(--loss)';
  if (impact === 'Medium') return 'var(--accent)';
  return 'var(--text-dim)';
}

function renderEconomicCalendar() {
  const el = document.getElementById('econcal-content');
  const updatedEl = document.getElementById('econcal-updated');
  if (!el) return;

  if (updatedEl) {
    updatedEl.innerText = econCalLastUpdated ? `Updated ${formatTime(econCalLastUpdated)}` : (econCalConfigured ? 'Awaiting first update' : '');
  }

  if (!econCalConfigured) {
    el.innerHTML = `<div class="empty-state">Economic Calendar isn't configured yet. This requires an <code>FMP_API_KEY</code> (Financial Modeling Prep) to be set on the server — see <a href="#settings" class="view-all-link">Settings</a> or the project README for setup instructions. No fabricated events are shown in the meantime.</div>`;
    return;
  }

  const currencyFilter = document.getElementById('econcal-currency-filter')?.value || 'All';
  const impactFilter = document.getElementById('econcal-impact-filter')?.value || 'All';

  let events = [...latestEconomicEvents];
  if (currencyFilter !== 'All') events = events.filter(e => e.currency === currencyFilter);
  if (impactFilter !== 'All') events = events.filter(e => e.impact === impactFilter);

  let staleNotice = '';
  if (econCalStatus === 'stale') staleNotice = '<div class="propfirm-warning caution" style="margin-bottom:12px;">⚠️ The feed hasn\'t refreshed recently — showing the last successfully fetched events, which may be slightly out of date.</div>';
  else if (econCalStatus === 'offline') staleNotice = '<div class="propfirm-warning critical" style="margin-bottom:12px;">🔴 The economic calendar feed is currently unavailable. Showing the last known events, if any — nothing here is invented.</div>';

  if (!events.length) {
    el.innerHTML = staleNotice + '<div class="empty-state">No events match these filters in the current window.</div>';
    return;
  }

  // Group by calendar day for readability.
  const groups = {};
  events.forEach(e => {
    const day = e.date.slice(0, 10);
    if (!groups[day]) groups[day] = [];
    groups[day].push(e);
  });

  el.innerHTML = staleNotice + Object.keys(groups).sort().map(day => `
    <div style="margin-bottom:18px;">
      <div style="font-weight:700; font-size:0.85rem; color:var(--accent); margin-bottom:8px;">${new Date(day + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</div>
      ${groups[day].map(e => `
        <div class="trade-row" style="cursor:default;">
          <div class="trade-row-left">
            <span class="trade-account-tag" style="background:var(--surface-alt); color:var(--text-dim);">${e.currency}</span>
            <div class="trade-row-info">
              <div class="trade-pair">${escapeHtml(e.event)}</div>
              <div class="trade-meta">${new Date(e.date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}${e.forecast !== null ? ' · Forecast: ' + e.forecast : ''}${e.previous !== null ? ' · Previous: ' + e.previous : ''}${e.actual !== null ? ' · Actual: ' + e.actual : ''}</div>
            </div>
          </div>
          <span class="trade-outcome-tag" style="color:${impactColor(e.impact)}; background:transparent; border:1px solid ${impactColor(e.impact)};">${e.impact || 'N/A'}</span>
        </div>
      `).join('')}
    </div>
  `).join('');
}

