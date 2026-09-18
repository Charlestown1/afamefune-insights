let currentUser = null;
let allTrades = [];
let propFirmAccounts = [];
let selectedPropFirmAccountId = null;

let marketPollTimer = null;
let tradesPollTimer = null;
let sessionPollTimer = null;
let latestMarket = {};

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
    const auth = document.getElementById('auth-container');
    const dash = document.getElementById('dashboard-container');
    const authHidden = auth && auth.classList.contains('hidden');
    const dashHidden = dash && dash.classList.contains('hidden');
    if (authHidden && dashHidden) {
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
  const authContainer = document.getElementById('auth-container');
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

  if (authContainer) authContainer.classList.remove('hidden');
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
  const authContainer = document.getElementById('auth-container');
  const dashContainer = document.getElementById('dashboard-container');
  const welcomeUser = document.getElementById('welcome-user');
  const userEmail = document.getElementById('user-email-display');
  const adminTabBtn = document.getElementById('admin-tab-btn');

  if (authContainer) authContainer.classList.add('hidden');
  if (dashContainer) dashContainer.classList.remove('hidden');
  if (welcomeUser) welcomeUser.innerText = `Welcome, ${currentUser.username}`;
  if (userEmail) userEmail.innerText = currentUser.email;

  // Admin tab is a UI convenience only — every admin API is separately
  // authorized server-side, so hiding/showing this button is not a security
  // boundary, just navigation.
  if (adminTabBtn) {
    if (currentUser.role === 'admin') adminTabBtn.classList.remove('hidden');
    else adminTabBtn.classList.add('hidden');
  }

  loadTrades();
  fetchMarket();
  fetchPropFirmAccounts();
  fetchAds();
  loadDonationInfo();
  updateForexSessions();

  if (marketPollTimer) clearInterval(marketPollTimer);
  if (tradesPollTimer) clearInterval(tradesPollTimer);
  if (sessionPollTimer) clearInterval(sessionPollTimer);

  marketPollTimer = setInterval(fetchMarket, 15000);
  tradesPollTimer = setInterval(() => { loadTrades(); fetchPropFirmAccounts(); }, 25000);
  sessionPollTimer = setInterval(updateForexSessions, 1000);
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
  return TRACKED.includes(k) ? k : null;
}

function updateRunningPrices() {
  allTrades.forEach((t) => {
    if (t.outcome !== 'Running') return;
    const key = normalizePairKey(t.pair);
    const m = key ? latestMarket[key] : null;
    if (!m || m.price === null || m.price === undefined) return;
    const el = document.getElementById(`current-price-${t._id}`);
    if (el) el.innerText = formatMarketPrice(key, m.price);
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
async function submitTrade(e) {
  e.preventDefault();
  const payload = {
    currencyPair: document.getElementById('currencyPair').value,
    tradeDirection: document.getElementById('tradeDirection').value,
    entryPrice: document.getElementById('entryPrice').value,
    exitPrice: document.getElementById('exitPrice').value,
    stopLoss: document.getElementById('stopLoss').value,
    takeProfit: document.getElementById('takeProfit').value,
    tradeOutcome: document.getElementById('tradeOutcome').value,
    tradeNotes: document.getElementById('tradeNotes').value,
    session: document.getElementById('tradeSession') ? document.getElementById('tradeSession').value : 'London',
    tags: getSelectedTags(),
    chartScreenshot: document.getElementById('chartScreenshot') ? document.getElementById('chartScreenshot').value.trim() : null,
    propFirmAccountId: document.getElementById('tradePropFirmAccount') ? document.getElementById('tradePropFirmAccount').value : '',
    riskAmount: document.getElementById('tradeRiskAmount') ? document.getElementById('tradeRiskAmount').value : '',
    realizedPL: document.getElementById('tradeRealizedPL') ? document.getElementById('tradeRealizedPL').value : ''
  };

  const aiBox = document.getElementById('ai-result');
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
      if (aiBox) aiBox.innerText = data.text;
      clearTags();
      if (document.getElementById('chartScreenshot')) document.getElementById('chartScreenshot').value = '';
      if (document.getElementById('chartScreenshotInput')) document.getElementById('chartScreenshotInput').value = '';
      if (document.getElementById('tradeRiskAmount')) document.getElementById('tradeRiskAmount').value = '';
      if (document.getElementById('tradeRealizedPL')) document.getElementById('tradeRealizedPL').value = '';
      loadTrades();
      fetchPropFirmAccounts();
    } else {
      if (aiBox) aiBox.innerText = "Error analyzing trade: " + (data.message || 'unknown error');
    }
  } catch (err) {
    if (aiBox) aiBox.innerText = "Network error while saving trade: " + err.message;
  }
}

async function loadTrades() {
  if (!currentUser) return;
  try {
    const res = await fetch('/api/trades');
    const data = await res.json();

    if (data.success && data.trades) {
      allTrades = [...data.trades].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

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
    const liveM = key ? latestMarket[key] : null;
    const currentDisplay = isRunning
      ? (liveM && liveM.price !== null && liveM.price !== undefined ? formatMarketPrice(key, liveM.price) : (t.currentPrice ?? '—'))
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
    if (account || t.riskAmount || (t.realizedPL !== null && t.realizedPL !== undefined)) {
      document.getElementById('modal-account').innerText = account ? account.accountName : 'Personal';
      document.getElementById('modal-risk').innerText = t.riskAmount ? '$' + t.riskAmount : 'N/A';
      document.getElementById('modal-pl').innerText = (t.realizedPL !== null && t.realizedPL !== undefined) ? (t.realizedPL >= 0 ? '+' : '') + '$' + t.realizedPL : 'N/A';
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

  document.getElementById('trade-modal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('trade-modal').classList.add('hidden');
}

function closeModalOnOverlay(e) {
  if (e.target.id === 'trade-modal') closeModal();
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeModal(); closePropFirmModal(); closeAdModal(); }
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
