'use strict';
const fs = require('fs');
const assert = require('assert');

const appSrc = fs.readFileSync(require('path').join(__dirname, '..', 'public', 'app.js'), 'utf8');
const lines = appSrc.split('\n');

function extractFunction(signature) {
  const start = lines.findIndex(l => l.includes(signature));
  if (start === -1) throw new Error('Not found: ' + signature);
  let depth = 0, end = -1, started = false;
  for (let i = start; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === '{') { depth++; started = true; }
      if (ch === '}') depth--;
    }
    if (started && depth === 0) { end = i; break; }
  }
  return lines.slice(start, end + 1).join('\n');
}

const computePerformanceStats = extractFunction('function computePerformanceStats(trades)');

const sandbox = { Math, Object, Array, isNaN, parseFloat, Infinity, module: { exports: {} } };
const vm = require('vm');
vm.createContext(sandbox);
vm.runInContext(`${computePerformanceStats}\nmodule.exports = computePerformanceStats;`, sandbox);
const fn = sandbox.module.exports;

let passed = 0, failed = 0;
function test(name, cb) {
  try { cb(); console.log('PASS:', name); passed++; }
  catch (e) { console.log('FAIL:', name, '->', e.message); failed++; }
}

console.log('======================================================');
console.log('TESTING THE ACTUAL computePerformanceStats() from app.js');
console.log('======================================================\n');

// Hand-verified scenario: 4 trades, known expected stats.
// T1: Win, R=+2.0   T2: Loss, R=-1.0   T3: Win, R=+3.0   T4: Loss, R=-1.0
const trades = [
  { outcome: 'Win', realizedR: 2.0, realizedPL: null, createdAt: '2026-01-01T00:00:00Z', closedAt: '2026-01-01T02:00:00Z' },
  { outcome: 'Loss', realizedR: -1.0, realizedPL: null, createdAt: '2026-01-02T00:00:00Z', closedAt: '2026-01-02T01:00:00Z' },
  { outcome: 'Win', realizedR: 3.0, realizedPL: null, createdAt: '2026-01-03T00:00:00Z', closedAt: '2026-01-03T03:00:00Z' },
  { outcome: 'Loss', realizedR: -1.0, realizedPL: null, createdAt: '2026-01-04T00:00:00Z', closedAt: '2026-01-04T01:00:00Z' }
];

const s = fn(trades);

test('winRate = 50%', () => assert.strictEqual(s.winRate, 50));
test('expectancyR = mean(2,-1,3,-1) = 0.75', () => assert.strictEqual(s.expectancyR, 0.75));
test('avgWinR = mean(2,3) = 2.5', () => assert.strictEqual(s.avgWinR, 2.5));
test('avgLossR = mean(-1,-1) = -1', () => assert.strictEqual(s.avgLossR, -1));
test('profitFactor = grossWin(5) / grossLoss(2) = 2.5', () => assert.strictEqual(s.profitFactor, 2.5));
test('bestTrade = 3', () => assert.strictEqual(s.bestTrade, 3));
test('worstTrade = -1', () => assert.strictEqual(s.worstTrade, -1));
test('maxWinStreak = 1 (alternating W/L/W/L)', () => assert.strictEqual(s.maxWinStreak, 1));
test('maxLossStreak = 1', () => assert.strictEqual(s.maxLossStreak, 1));

// Equity path: +2, +1(peak2), +4(peak4), +3 -> peak-to-trough max DD = 4-... 
// cum sequence: 2, 1, 4, 3. peak tracks: 2,2,4,4. dd = peak-cum: 0,1,0,1 -> maxDD=1
test('maxDrawdownR = 1 (from cumulative curve 2,1,4,3)', () => assert.strictEqual(s.maxDrawdownR, 1));
test('recoveryFactor = netR(3) / maxDD(1) = 3', () => assert.strictEqual(s.recoveryFactor, 3));

test('avgHoldingMs = mean of (2h,1h,3h,1h) = 1.75h in ms', () => {
  const expectedMs = ((2 + 1 + 3 + 1) / 4) * 3600000;
  assert.strictEqual(s.avgHoldingMs, expectedMs);
});

// ---- Edge case: no closed trades at all ----
test('Empty input does not throw and returns sane zeros/nulls', () => {
  const empty = fn([]);
  assert.strictEqual(empty.totalClosed, 0);
  assert.strictEqual(empty.winRate, 0);
  assert.strictEqual(empty.expectancyR, null);
  assert.strictEqual(empty.profitFactor, 0);
});

// ---- Edge case: all wins, no losses -> profitFactor should be Infinity, not divide-by-zero NaN ----
test('All-wins scenario -> profitFactor is Infinity, not NaN', () => {
  const allWins = [
    { outcome: 'Win', realizedR: 1.5, realizedPL: null },
    { outcome: 'Win', realizedR: 2.0, realizedPL: null }
  ];
  const r = fn(allWins);
  assert.strictEqual(r.profitFactor, Infinity);
  assert.strictEqual(Number.isNaN(r.profitFactor), false);
});

// ---- Realistic mixed-R-and-dollar scenario (some trades only have $ data) ----
test('Dollar-based avg winner/loser computed independently of R data', () => {
  const mixed = [
    { outcome: 'Win', realizedR: null, realizedPL: 250 },
    { outcome: 'Loss', realizedR: null, realizedPL: -100 },
    { outcome: 'Win', realizedR: 2, realizedPL: null } // no $ data, has R
  ];
  const r = fn(mixed);
  assert.strictEqual(r.avgWinnerDollar, 250);
  assert.strictEqual(r.avgLoserDollar, -100);
  assert.strictEqual(r.hasDollarData, true);
});

console.log('\n======================================================');
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
console.log('======================================================');
process.exitCode = failed > 0 ? 1 : 0;
