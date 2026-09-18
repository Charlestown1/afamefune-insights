let currentUser = null;
let allTrades = [];
let marketPollTimer = null;
let tradesPollTimer = null;
let sessionPollTimer = null;
let latestMarket = {};

let currentSearchQuery = '';
let currentOutcomeFilter = 'All';
let currentSessionFilter = 'All';

const TRACKED = ['GBPUSD', 'USDCAD', 'XAUUSD', 'BTCUSD', 'USDJPY'];

// ---------- SAFE EVENT BINDING ON LOAD ----------
document.addEventListener('DOMContentLoaded', () => {
  try { setupTabs(); } catch (e) { console.error('setupTabs failed:', e); }
  try { setupForms(); } catch (e) { console.error('setupForms failed:', e); }
  try { setupScreenshotHandler(); } catch (e) { console.error('setupScreenshotHandler failed:', e); }

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

  if (loginTabBtn) {
    loginTabBtn.addEventListener('click', () => switchTab('login'));
  }
  if (signupTabBtn) {
    signupTabBtn.addEventListener('click', () => switchTab('signup'));
  }
}

function setupForms() {
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);
  }

  const signupForm = document.getElementById('signup-form');
  if (signupForm) {
    signupForm.addEventListener('submit', handleSignup);
  }

  const tradeForm = document.getElementById('trade-form');
  if (tradeForm) {
    tradeForm.addEventListener('submit', submitTrade);
  }

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
        const base64Val = uploadEvent.target.result;
        const hiddenInput = document.getElementById('chartScreenshot');
        if (hiddenInput) hiddenInput.value = base64Val;
      };
      reader.readAsDataURL(file);
    });
  }
}

function switchTab(tab) {
  const tabs = document.querySelectorAll('.tab');
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');

  if (tabs.length >= 2) {
    tabs.forEach(t => t.classList.remove('active'));
  }

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

// ---------- AUTH CHECK ----------
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
    if (errorEl) errorEl.innerText = 'Network error during login';
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
    if (errorEl) errorEl.innerText = 'Network error during signup';
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

  if (authContainer) authContainer.classList.add('hidden');
  if (dashContainer) dashContainer.classList.remove('hidden');
  if (welcomeUser) welcomeUser.innerText = `Welcome, ${currentUser.username}`;
  if (userEmail) userEmail.innerText = currentUser.email;

  loadTrades();
  fetchMarket();
  updateTradingSessions();

  if (marketPollTimer) clearInterval(marketPollTimer);
  if (tradesPollTimer) clearInterval(tradesPollTimer);
  if (sessionPollTimer) clearInterval(sessionPollTimer);

  marketPollTimer = setInterval(fetchMarket, 15000);
  tradesPollTimer = setInterval(loadTrades, 25000);
  sessionPollTimer = setInterval(updateTradingSessions, 1000);
}

// ---------- LIVE FOREX SESSION, WAT CLOCK & COUNTDOWN ----------
function updateTradingSessions() {
  const now = new Date();
  const utcSec = now.getUTCSeconds();
  const utcMin = now.getUTCMinutes();
  const utcHours = now.getUTCHours();

  let totalSecondsToday = (utcHours * 3600 + utcMin * 60 + utcSec + 3600) % 86400;

  const watHours = Math.floor(totalSecondsToday / 3600) % 24;
  const watMins = Math.floor((totalSecondsToday % 3600) / 60);
  const watSecs = totalSecondsToday % 60;

  const currentWatDecimal = watHours + (watMins / 60) + (watSecs / 3600);
  const activeSessions = [];

  if (currentWatDecimal >= 1 && currentWatDecimal < 10) activeSessions.push("🇯🇵 Asian");
  if (currentWatDecimal >= 9 && currentWatDecimal < 17) activeSessions.push("🇬🇧 London");
  if (currentWatDecimal >= 14 && currentWatDecimal < 22) activeSessions.push("🇺🇸 New York");

  const sessionSchedules = [
    { name: "🇯🇵 Asian", startSec: 1 * 3600 },
    { name: "🇬🇧 London", startSec: 9 * 3600 },
    { name: "🇺🇸 New York", startSec: 14 * 3600 }
  ];

  let nextSessionName = "";
  let minDiffSeconds = Infinity;

  sessionSchedules.forEach(s => {
    let diff = s.startSec - totalSecondsToday;
    if (diff <= 0) diff += 86400;
    if (diff < minDiffSeconds) {
      minDiffSeconds = diff;
      nextSessionName = s.name;
    }
  });

  const cHours = Math.floor(minDiffSeconds / 3600);
  const cMins = Math.floor((minDiffSeconds % 3600) / 60);
  const cSecs = minDiffSeconds % 60;

  const timeEl = document.getElementById('wat-time-display');
  const sessionEl = document.getElementById('active-session-display');
  const countdownEl = document.getElementById('session-countdown');

  if (timeEl) {
    timeEl.innerText = `${String(watHours).padStart(2, '0')}:${String(watMins).padStart(2, '0')} WAT`;
  }

  if (sessionEl) {
    if (activeSessions.length > 0) {
      sessionEl.innerHTML = activeSessions.map(s => `<span style="background: rgba(234, 179, 8, 0.15); color: var(--accent); padding: 3px 8px; border-radius: 4px; margin-right: 6px; display:inline-block;">${s}</span>`).join(' ');
    } else {
      sessionEl.innerHTML = `<span style="color: var(--text-muted);">💤 Inter-session / Market Quiet</span>`;
    }
  }

  if (countdownEl) {
    countdownEl.innerText = `Next: ${nextSessionName} opens in ${String(cHours).padStart(2, '0')}:${String(cMins).padStart(2, '0')}:${String(cSecs).padStart(2, '0')}`;
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
  const pills = document.querySelectorAll('.strategy-pill');
  pills.forEach(p => p.classList.remove('active'));
}

// ---------- PROP FIRM RISK GUARDRAILS ----------
function updatePropGuardrails(tradesList) {
  const maxDailyRiskDollars = 500;
  let totalExposedRisk = 0;

  tradesList.forEach(t => {
    if (t.outcome === 'Running' && t.entry && t.stopLoss) {
      const riskPerUnit = Math.abs(Number(t.entry) - Number(t.stopLoss));
      totalExposedRisk += riskPerUnit * 100;
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
    statusText.style.color = 'var(--loss, #ef4444)';
    barFill.style.background = 'var(--loss, #ef4444)';
  } else if (riskPercentageUsed > 40) {
    statusText.innerText = `Moderate Exposure (${riskPercentageUsed.toFixed(1)}% utilized)`;
    statusText.style.color = 'var(--accent, #eab308)';
    barFill.style.background = 'var(--accent, #eab308)';
  } else {
    statusText.innerText = `Safe zone (${riskPercentageUsed.toFixed(1)}% risk exposed)`;
    statusText.style.color = 'var(--win, #22c55e)';
    barFill.style.background = 'var(--win, #22c55e)';
  }

  barFill.style.width = `${bufferRemaining}%`;
  pctDisplay.innerText = `${bufferRemaining}% Buffer`;
}

// ---------- ADVANCED ANALYTICS ----------
function computeAdvancedMetrics(tradesList) {
  let totalGrossProfit = 0;
  let totalGrossLoss = 0;
  let riskRewardSum = 0;
  let validRRCount = 0;

  tradesList.forEach(t => {
    const entry = Number(t.entry);
    const sl = Number(t.stopLoss);
    const tp = Number(t.takeProfit);
    const exit = Number(t.exit);

    if (!isNaN(entry) && !isNaN(sl) && !isNaN(tp) && entry !== sl) {
      const risk = Math.abs(entry - sl);
      const reward = Math.abs(tp - entry);
      riskRewardSum += (reward / risk);
      validRRCount++;
    }

    if (t.outcome === 'Win' && !isNaN(entry) && !isNaN(exit)) {
      totalGrossProfit += Math.abs(exit - entry);
    } else if (t.outcome === 'Loss' && !isNaN(entry) && !isNaN(exit)) {
      totalGrossLoss += Math.abs(exit - entry);
    }
  });

  const avgRR = validRRCount > 0 ? (riskRewardSum / validRRCount).toFixed(2) : '0.00';
  const profitFactor = totalGrossLoss > 0 ? (totalGrossProfit / totalGrossLoss).toFixed(2) : (totalGrossProfit > 0 ? 'Infinite' : '0.00');
  return { avgRR, profitFactor };
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
    chartScreenshot: document.getElementById('chartScreenshot') ? document.getElementById('chartScreenshot').value.trim() : null
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
      loadTrades();
    } else {
      if (aiBox) aiBox.innerText = "Error analyzing trade: " + (data.message || 'unknown error');
    }
  } catch (err) {
    if (aiBox) aiBox.innerText = "Network error while saving trade: " + err.message;
  }
}

// ---------- LOAD TRADES & STATISTICS ----------
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

      const statTotal = document.getElementById('stat-total');
      const statWinrate = document.getElementById('stat-winrate');
      const statRecord = document.getElementById('stat-record');
      const statStreak = document.getElementById('stat-streak');

      if (statTotal) statTotal.innerText = total;
      if (statWinrate) statWinrate.innerText = winRate + '%';
      if (statRecord) statRecord.innerText = `${wins}W / ${losses}L`;
      if (statStreak) statStreak.innerText = computeStreak(allTrades);

      const metrics = computeAdvancedMetrics(allTrades);
      const avgRREl = document.getElementById('stat-avgrr');
      if (avgRREl) avgRREl.innerText = metrics.avgRR + 'R';
      const pfEl = document.getElementById('stat-profitfactor');
      if (pfEl) pfEl.innerText = metrics.profitFactor;

      updatePropGuardrails(allTrades);
      renderTradesList();
    } else {
      allTrades = [];
      if (document.getElementById('stat-total')) document.getElementById('stat-total').innerText = 0;
      if (document.getElementById('stat-winrate')) document.getElementById('stat-winrate').innerText = '0.0%';
      if (document.getElementById('stat-record')) document.getElementById('stat-recor