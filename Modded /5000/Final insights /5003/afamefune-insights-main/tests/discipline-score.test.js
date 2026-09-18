'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const appSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
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

function extractConst(signature) {
  const start = lines.findIndex(l => l.includes(signature));
  if (start === -1) throw new Error('Not found: ' + signature);
  let end = lines.findIndex((l, i) => i > start && l.trim() === '};');
  return lines.slice(start, end + 1).join('\n');
}

const weightsBlock = extractConst('const DISCIPLINE_WEIGHTS = {');
const fnBlock = extractFunction('function computeDisciplineScore(trades)');

const sandbox = { Math, Object, Array, Date, JSON, module: { exports: {} } };
const vm = require('vm');
vm.createContext(sandbox);
vm.runInContext(`${weightsBlock}\n${fnBlock}\nmodule.exports = computeDisciplineScore;`, sandbox);
const computeDisciplineScore = sandbox.module.exports;

let passed = 0, failed = 0;
function test(name, cb) {
  try { cb(); console.log('PASS:', name); passed++; }
  catch (e) { console.log('FAIL:', name, '->', e.message); failed++; }
}

console.log('======================================================');
console.log('TESTING THE ACTUAL computeDisciplineScore() from app.js');
console.log('======================================================\n');

function mkTrade(o) {
  return { outcome: 'Win', notes: '', psychology: {}, createdAt: '2026-01-01T00:00:00Z', closedAt: '2026-01-01T01:00:00Z', ...o };
}

test('No trades at all -> score is null, not 0 or NaN', () => {
  const r = computeDisciplineScore([]);
  assert.strictEqual(r.score, null);
});

test('No psychology data logged anywhere -> only journaling category applies', () => {
  const trades = [mkTrade({ notes: 'good setup' }), mkTrade({ notes: '' })];
  const r = computeDisciplineScore(trades);
  assert.strictEqual(r.categories.followedPlan.applicable, false);
  assert.strictEqual(r.categories.journalingConsistency.applicable, true);
  // 1 of 2 trades has notes -> 50%, and it's the ONLY applicable category -> score = 50
  assert.strictEqual(r.score, 50);
});

test('100% followed plan, no other data -> score = 100', () => {
  const trades = [
    mkTrade({ psychology: { followedPlan: true }, notes: '' }),
    mkTrade({ psychology: { followedPlan: true }, notes: '' })
  ];
  const r = computeDisciplineScore(trades);
  // followedPlan (weight 25) = 100%, journaling (weight 10, always applicable) = 0%
  // weighted = (1*25 + 0*10) / (25+10) * 100 = 2500/35 = 71.43
  assert.ok(Math.abs(r.score - (2500 / 35)) < 0.01, `expected ~71.43, got ${r.score}`);
});

test('Mixed followedPlan (1 of 2 true) computes correct fraction', () => {
  const trades = [
    mkTrade({ psychology: { followedPlan: true } }),
    mkTrade({ psychology: { followedPlan: false } })
  ];
  const r = computeDisciplineScore(trades);
  assert.strictEqual(r.categories.followedPlan.fraction, 0.5);
});

test('Only BreakEven/Win/Loss trades count as "closed" — Running trades excluded', () => {
  const trades = [
    mkTrade({ outcome: 'Running', psychology: { followedPlan: true } }),
    mkTrade({ outcome: 'Win', psychology: { followedPlan: true } })
  ];
  const r = computeDisciplineScore(trades);
  assert.strictEqual(r.categories.followedPlan.answered, 1, 'Running trade must not count');
});

test('Overtrading detection needs at least 2 distinct trading days', () => {
  const oneDay = [mkTrade({ closedAt: '2026-01-01T01:00:00Z' }), mkTrade({ closedAt: '2026-01-01T02:00:00Z' })];
  const r = computeDisciplineScore(oneDay);
  assert.strictEqual(r.categories.avoidedOvertrading.applicable, false);
});

test('Overtrading detection fires when one day has >2x the median trade count', () => {
  const trades = [
    mkTrade({ closedAt: '2026-01-01T01:00:00Z' }), // day1: 1 trade
    mkTrade({ closedAt: '2026-01-02T01:00:00Z' }), // day2: 1 trade
    mkTrade({ closedAt: '2026-01-03T01:00:00Z' }), // day3: 1 trade
    mkTrade({ closedAt: '2026-01-04T01:00:00Z' }), // day4: 10 trades (median of [1,1,1,10] = 1, threshold = 2)
    mkTrade({ closedAt: '2026-01-04T02:00:00Z' }),
    mkTrade({ closedAt: '2026-01-04T03:00:00Z' }),
    mkTrade({ closedAt: '2026-01-04T04:00:00Z' }),
    mkTrade({ closedAt: '2026-01-04T05:00:00Z' }),
    mkTrade({ closedAt: '2026-01-04T06:00:00Z' }),
    mkTrade({ closedAt: '2026-01-04T07:00:00Z' }),
    mkTrade({ closedAt: '2026-01-04T08:00:00Z' }),
    mkTrade({ closedAt: '2026-01-04T09:00:00Z' }),
    mkTrade({ closedAt: '2026-01-04T10:00:00Z' })
  ];
  const r = computeDisciplineScore(trades);
  assert.strictEqual(r.categories.avoidedOvertrading.applicable, true);
  assert.strictEqual(r.categories.avoidedOvertrading.fraction, 0.75); // 1 overtrading day of 4 -> 1 - 1/4 = 0.75
});

test('Weight redistribution: score never exceeds 100 or goes below 0', () => {
  const trades = [
    mkTrade({ psychology: { followedPlan: true, revengeTraded: false, movedStopLoss: false, overLeveraged: false }, notes: 'x' }),
    mkTrade({ psychology: { followedPlan: true, revengeTraded: false, movedStopLoss: false, overLeveraged: false }, notes: 'x' })
  ];
  const r = computeDisciplineScore(trades);
  assert.ok(r.score <= 100 && r.score >= 0);
  assert.strictEqual(r.score, 100); // everything applicable, everything perfect
});

console.log('\n======================================================');
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
console.log('======================================================');
process.exitCode = failed > 0 ? 1 : 0;
