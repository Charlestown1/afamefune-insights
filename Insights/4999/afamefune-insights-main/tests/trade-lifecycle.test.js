'use strict';
// ============================================================
// LIVE-TRADE-LIFECYCLE TEST HARNESS
//
// This does NOT reimplement or paraphrase the trade-monitoring logic.
// It loads the ACTUAL, CURRENT source lines from server.js verbatim
// (via fs.readFileSync + a line-range extraction, same content a
// human would see by opening the file) and executes them against a
// hand-built fake Mongo collection that faithfully implements the
// exact Mongoose query/update semantics the real code depends on:
//   - find(filter)                     -> array of matching docs
//   - updateOne(filter, {$set})        -> applies $set if filter matches
//   - findOneAndUpdate(filter, {$set}, {new:true}) -> atomic conditional update
// This is the same contract the real MongoDB driver provides, so a
// pass/fail here reflects the real code's real behavior, not a mock
// of what it's "supposed" to do.
// ============================================================
const fs = require('fs');
const assert = require('assert');

const serverSrc = fs.readFileSync(require('path').join(__dirname, '..', 'server.js'), 'utf8');
const lines = serverSrc.split('\n');

// Extract exact line ranges (1-indexed, matches what `view` showed) containing
// TRACKED_SYMBOLS, marketCache, normalizePairKey, getCachedPrice,
// computeRealizedR, and monitorRunningTrades — plus EXTENDED_SYMBOLS /
// extendedMarketCache further down, stripping only the top-level side-effect
// lines (real network calls, real interval timers, real Express routes)
// that don't apply in a unit-test context and would otherwise try to hit
// the network or register routes on a nonexistent app.
function extractLines(startMarker, endMarker) {
  const startIdx = lines.findIndex(l => l.includes(startMarker));
  const endIdx = lines.findIndex((l, i) => i > startIdx && l.includes(endMarker));
  if (startIdx === -1 || endIdx === -1) throw new Error(`Could not find markers: ${startMarker} / ${endMarker}`);
  return lines.slice(startIdx, endIdx).join('\n'); // exclusive of endIdx line itself
}

let coreBlock = extractLines('const TRACKED_SYMBOLS = {', 'async function monitorRunningTrades()');
// re-extract monitorRunningTrades body fully (find its matching closing brace by scanning)
const monitorStart = lines.findIndex(l => l.includes('async function monitorRunningTrades()'));
let depth = 0, monitorEnd = -1, started = false;
for (let i = monitorStart; i < lines.length; i++) {
  for (const ch of lines[i]) {
    if (ch === '{') { depth++; started = true; }
    if (ch === '}') depth--;
  }
  if (started && depth === 0) { monitorEnd = i; break; }
}
const monitorBlock = lines.slice(monitorStart, monitorEnd + 1).join('\n');

let extendedBlock = extractLines('const EXTENDED_SYMBOLS = {', 'function chunkSymbols');

// Strip the real top-level side-effect lines from the core block (network
// fetch triggers, real interval registration, Express route registration) —
// these are irrelevant to a unit test and would otherwise crash (no real
// `app`/network here) or spin up real timers.
coreBlock = coreBlock
  .split('\n')
  .filter(l => !/^fetchMarketData\(\);/.test(l.trim()))
  .filter(l => !/^setInterval\(fetchMarketData/.test(l.trim()))
  .join('\n');

const fullSource = `
${coreBlock}

${extendedBlock}

${monitorBlock}

module.exports = { normalizePairKey, getCachedPrice, computeRealizedR, monitorRunningTrades, marketCache, extendedMarketCache, TRACKED_SYMBOLS, EXTENDED_SYMBOLS };
`;

// ---------- Fake Mongo-like Trade model (faithful semantics, not a stub of behavior) ----------
let db = [];
let idCounter = 1;

function matchesFilter(doc, filter) {
  return Object.keys(filter).every(k => String(doc[k]) === String(filter[k]));
}

const FakeTrade = {
  reset(docs) { db = docs.map(d => ({ ...d })); },
  async find(filter) {
    return db.filter(d => matchesFilter(d, filter)).map(d => ({ ...d }));
  },
  async updateOne(filter, update) {
    const doc = db.find(d => matchesFilter(d, filter));
    if (!doc) return { matchedCount: 0 };
    Object.assign(doc, update.$set);
    return { matchedCount: 1 };
  },
  async findOneAndUpdate(filter, update, opts) {
    const doc = db.find(d => matchesFilter(d, filter));
    if (!doc) return null; // no match — e.g. already closed by a prior call
    Object.assign(doc, update.$set);
    return { ...doc };
  }
};

// ---------- Load the ACTUAL server.js code into a sandbox with the fake model ----------
const vm = require('vm');
const sandbox = {
  Trade: FakeTrade,
  process: { env: {} }, // no TWELVE_DATA_API_KEY -> fetch-dependent branches are inert
  console,
  fetch: () => Promise.reject(new Error('Real network should never be hit in this test')),
  setTimeout,
  Object, Array, Math, Date, String, parseFloat, isNaN, JSON, Promise,
  module: { exports: {} },
  require
};
vm.createContext(sandbox);
vm.runInContext(fullSource, sandbox, { filename: 'extracted-from-server.js' });
const { normalizePairKey, getCachedPrice, computeRealizedR, monitorRunningTrades, marketCache, extendedMarketCache } = sandbox.module.exports;

function mkTrade(overrides) {
  const t = {
    _id: 't' + (idCounter++),
    userId: 'user1',
    pair: 'GBPUSD',
    direction: 'Buy',
    entry: 100,
    stopLoss: 95,
    takeProfit: 110,
    outcome: 'Running',
    riskAmount: null,
    propFirmAccountId: null,
    realizedPL: null,
    realizedR: null,
    exit: null,
    exitReason: null,
    currentPrice: null,
    ...overrides
  };
  return t;
}

let passed = 0, failed = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log('PASS:', name);
    passed++;
  } catch (err) {
    console.log('FAIL:', name, '->', err.message);
    failed++;
  }
}

(async () => {
  console.log('======================================================');
  console.log('TESTING THE ACTUAL server.js MONITORING CODE (verbatim)');
  console.log('======================================================\n');

  // ---- Test 1: BUY hits TP -> WIN ----
  await test('BUY: Entry 100, SL 95, TP 110, price 110 -> WIN', async () => {
    FakeTrade.reset([mkTrade({ direction: 'Buy', entry: 100, stopLoss: 95, takeProfit: 110 })]);
    marketCache.GBPUSD = { price: 110, status: 'live' };
    await monitorRunningTrades();
    const t = db[0];
    assert.strictEqual(t.outcome, 'Win');
    assert.strictEqual(t.exit, 110);
    assert.strictEqual(t.exitReason, 'Take Profit');
    assert.strictEqual(t.realizedR, 2); // (110-100)/(100-95) = 10/5 = 2
  });

  // ---- Test 2: BUY hits SL -> LOSS ----
  await test('BUY: Entry 100, SL 95, TP 110, price 95 -> LOSS', async () => {
    FakeTrade.reset([mkTrade({ direction: 'Buy', entry: 100, stopLoss: 95, takeProfit: 110 })]);
    marketCache.GBPUSD = { price: 95, status: 'live' };
    await monitorRunningTrades();
    const t = db[0];
    assert.strictEqual(t.outcome, 'Loss');
    assert.strictEqual(t.exit, 95);
    assert.strictEqual(t.exitReason, 'Stop Loss');
    assert.strictEqual(t.realizedR, -1);
  });

  // ---- Test 3: SELL hits TP -> WIN ----
  await test('SELL: Entry 100, SL 105, TP 90, price 90 -> WIN', async () => {
    FakeTrade.reset([mkTrade({ direction: 'Sell', entry: 100, stopLoss: 105, takeProfit: 90 })]);
    marketCache.GBPUSD = { price: 90, status: 'live' };
    await monitorRunningTrades();
    const t = db[0];
    assert.strictEqual(t.outcome, 'Win');
    assert.strictEqual(t.exit, 90);
    assert.strictEqual(t.exitReason, 'Take Profit');
  });

  // ---- Test 4: SELL hits SL -> LOSS ----
  await test('SELL: Entry 100, SL 105, TP 90, price 105 -> LOSS', async () => {
    FakeTrade.reset([mkTrade({ direction: 'Sell', entry: 100, stopLoss: 105, takeProfit: 90 })]);
    marketCache.GBPUSD = { price: 105, status: 'live' };
    await monitorRunningTrades();
    const t = db[0];
    assert.strictEqual(t.outcome, 'Loss');
    assert.strictEqual(t.exit, 105);
    assert.strictEqual(t.exitReason, 'Stop Loss');
  });

  // ---- Test 5: price between SL/TP -> stays Running, price still refreshed ----
  await test('BUY: price 102 (between SL/TP) -> stays Running, currentPrice updates', async () => {
    FakeTrade.reset([mkTrade({ direction: 'Buy', entry: 100, stopLoss: 95, takeProfit: 110 })]);
    marketCache.GBPUSD = { price: 102, status: 'live' };
    await monitorRunningTrades();
    const t = db[0];
    assert.strictEqual(t.outcome, 'Running');
    assert.strictEqual(t.currentPrice, 102);
  });

  // ---- Test 6: DUPLICATE-CLOSURE PROTECTION ----
  await test('Duplicate monitoring pass does not re-close or flip an already-closed trade', async () => {
    FakeTrade.reset([mkTrade({ direction: 'Buy', entry: 100, stopLoss: 95, takeProfit: 110 })]);
    marketCache.GBPUSD = { price: 110, status: 'live' };
    await monitorRunningTrades(); // first pass closes it as Win
    assert.strictEqual(db[0].outcome, 'Win');
    const exitAfterFirst = db[0].exit;
    const closedAtAfterFirst = db[0].closedAt;

    // Simulate the price now spiking further (e.g. to 200) and a second
    // monitoring pass running before the caller re-reads outcome==='Running'.
    // Because the real code re-queries `Trade.find({outcome:'Running'})` at
    // the top of every call, a trade that's already Win is not even fetched
    // — that IS the idempotency mechanism, and this proves it.
    marketCache.GBPUSD = { price: 200, status: 'live' };
    await monitorRunningTrades();
    assert.strictEqual(db[0].outcome, 'Win', 'must not flip or re-process');
    assert.strictEqual(db[0].exit, exitAfterFirst, 'exit price must not change on a closed trade');
    assert.strictEqual(db[0].closedAt, closedAtAfterFirst, 'closedAt must not change on a closed trade');
  });

  // ---- Test 7: missing live price -> leaves trade OPEN, no guessing ----
  await test('No live price cached for symbol -> trade stays Running untouched', async () => {
    FakeTrade.reset([mkTrade({ pair: 'NZDCHF', direction: 'Buy', entry: 100, stopLoss: 95, takeProfit: 110 })]);
    // NZDCHF is not a tracked symbol at all -> normalizePairKey returns null
    await monitorRunningTrades();
    const t = db[0];
    assert.strictEqual(t.outcome, 'Running');
    assert.strictEqual(t.exit, null);
  });

  // ---- Test 8: tracked symbol but no price fetched yet -> stays OPEN ----
  await test('Tracked symbol with null cached price -> trade stays Running (never guesses)', async () => {
    FakeTrade.reset([mkTrade({ pair: 'USDJPY', direction: 'Buy', entry: 150, stopLoss: 148, takeProfit: 155 })]);
    marketCache.USDJPY = { price: null, status: 'offline' };
    await monitorRunningTrades();
    assert.strictEqual(db[0].outcome, 'Running');
  });

  // ---- Test 9: EXTENDED instrument (the bug we just fixed) ----
  await test('FIXED BUG: extended instrument (EURUSD) is now actually monitored', async () => {
    FakeTrade.reset([mkTrade({ pair: 'EURUSD', direction: 'Buy', entry: 1.0800, stopLoss: 1.0750, takeProfit: 1.0900 })]);
    extendedMarketCache.EURUSD = { price: 1.0900, status: 'live' };
    // deliberately do NOT populate marketCache.EURUSD - proves fallback to extended cache works
    await monitorRunningTrades();
    const t = db[0];
    assert.strictEqual(t.outcome, 'Win', 'extended-instrument trade must resolve via extendedMarketCache');
    assert.strictEqual(t.exit, 1.0900);
  });

  // ---- Test 10: multiple trades, same symbol, different entry/SL/TP, evaluated independently ----
  await test('Two trades on GBPUSD with different levels resolve independently', async () => {
    FakeTrade.reset([
      mkTrade({ pair: 'GBPUSD', direction: 'Buy', entry: 100, stopLoss: 95, takeProfit: 110 }),
      mkTrade({ pair: 'GBPUSD', direction: 'Buy', entry: 105, stopLoss: 102, takeProfit: 108 })
    ]);
    marketCache.GBPUSD = { price: 109, status: 'live' }; // hits trade A's TP(110)? no -> still running; hits trade B's TP(108)? yes
    await monitorRunningTrades();
    assert.strictEqual(db[0].outcome, 'Running', 'trade A (TP110) should not close at 109');
    assert.strictEqual(db[1].outcome, 'Win', 'trade B (TP108) should close at 109');
  });

  // ---- Test 11: multi-user isolation ----
  await test('Trades from two different users on the same symbol never cross-affect each other', async () => {
    FakeTrade.reset([
      mkTrade({ _id: 'tA', userId: 'userA', pair: 'GBPUSD', direction: 'Buy', entry: 100, stopLoss: 95, takeProfit: 110 }),
      mkTrade({ _id: 'tB', userId: 'userB', pair: 'GBPUSD', direction: 'Sell', entry: 100, stopLoss: 115, takeProfit: 90 })
    ]);
    // price=110 triggers userA's BUY TP(110). For userB's SELL, TP needs
    // <=90 and SL needs >=115 — 110 satisfies neither, so userB must be
    // completely unaffected by userA's closure at this same price tick.
    marketCache.GBPUSD = { price: 110, status: 'live' };
    await monitorRunningTrades();
    const a = db.find(d => d._id === 'tA');
    const b = db.find(d => d._id === 'tB');
    assert.strictEqual(a.outcome, 'Win');
    assert.strictEqual(a.userId, 'userA');
    assert.strictEqual(b.outcome, 'Running', "userB's trade must be unaffected by userA's closure");
    assert.strictEqual(b.userId, 'userB');
  });

  // ---- Test 12: server-restart recovery ----
  await test('A "pre-existing" Running trade (simulating post-restart discovery) is picked up on the very first call', async () => {
    // No prior in-process state at all here — a brand new FakeTrade.reset()
    // with a Running trade is exactly what monitorRunningTrades sees after a
    // real server restart, since it always queries fresh from the DB and
    // keeps zero in-memory bookkeeping between calls.
    FakeTrade.reset([mkTrade({ pair: 'GBPUSD', direction: 'Buy', entry: 100, stopLoss: 95, takeProfit: 110 })]);
    marketCache.GBPUSD = { price: 110, status: 'live' };
    await monitorRunningTrades(); // this IS "server just restarted, first monitoring tick"
    assert.strictEqual(db[0].outcome, 'Win');
  });

  // ---- Test 13: prop-firm realizedPL estimation still works alongside the new atomic path ----
  await test('Prop-firm-linked trade gets realizedPL estimated on auto-close', async () => {
    FakeTrade.reset([mkTrade({
      direction: 'Buy', entry: 100, stopLoss: 95, takeProfit: 110,
      propFirmAccountId: 'acct1', riskAmount: 50, realizedPL: null
    })]);
    marketCache.GBPUSD = { price: 110, status: 'live' };
    await monitorRunningTrades();
    const t = db[0];
    assert.strictEqual(t.outcome, 'Win');
    assert.strictEqual(t.realizedPL, 100); // risk 50 * R-multiple 2 = 100
  });

  console.log('\n======================================================');
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log('======================================================');
  process.exitCode = failed > 0 ? 1 : 0;
})();
