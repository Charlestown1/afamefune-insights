'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const serverSrc = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const lines = serverSrc.split('\n');

function extractLines(startMarker, endMarkerExclusive) {
  const startIdx = lines.findIndex(l => l.includes(startMarker));
  const endIdx = lines.findIndex((l, i) => i > startIdx && l.includes(endMarkerExclusive));
  if (startIdx === -1 || endIdx === -1) throw new Error(`Could not find markers: ${startMarker} / ${endMarkerExclusive}`);
  return lines.slice(startIdx, endIdx).join('\n');
}

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

const countryMapBlock = extractLines('const COUNTRY_TO_CURRENCY = {', 'let economicCalendarCache');
const sanitizeTextFn = extractFunction('function sanitizeText(str, maxLen)');
const normalizeFn = extractFunction('function normalizeEconomicEvents(rawArray)');

const sandbox = { Math, Object, Array, Date, JSON, String, module: { exports: {} } };
const vm = require('vm');
vm.createContext(sandbox);
vm.runInContext(`${sanitizeTextFn}\n${countryMapBlock}\n${normalizeFn}\nmodule.exports = normalizeEconomicEvents;`, sandbox);
const normalizeEconomicEvents = sandbox.module.exports;

let passed = 0, failed = 0;
function test(name, cb) {
  try { cb(); console.log('PASS:', name); passed++; }
  catch (e) { console.log('FAIL:', name, '->', e.message); failed++; }
}

console.log('======================================================');
console.log('TESTING THE ACTUAL normalizeEconomicEvents() from server.js');
console.log('======================================================\n');

// This is FMP's OWN published example response (confirmed via their
// documentation) — not fabricated by this test.
const REAL_FMP_SAMPLE = [
  { event: 'Net Long-Term Tic Flows (Aug)', date: '2021-10-18 21:00:00', country: 'US', actual: 79.3, previous: 2, change: 77.3, changePercentage: 3865.0, estimate: null, impact: 'Medium' },
  { event: 'Foreign Bond Investment (Aug)', date: '2021-10-18 21:00:00', country: 'US', actual: 30.7, previous: 10.2, change: 20.5, changePercentage: 200.98, estimate: null, impact: 'Medium' }
];

test('Real FMP sample data normalizes without throwing', () => {
  const result = normalizeEconomicEvents(REAL_FMP_SAMPLE);
  assert.strictEqual(result.length, 2);
});

test('US country correctly maps to USD currency', () => {
  const result = normalizeEconomicEvents(REAL_FMP_SAMPLE);
  assert.strictEqual(result[0].currency, 'USD');
});

test('estimate field is renamed to forecast in normalized output', () => {
  const raw = [{ event: 'CPI m/m', date: '2026-01-15 13:30:00', country: 'US', estimate: 0.3, actual: null, previous: 0.2, impact: 'High' }];
  const result = normalizeEconomicEvents(raw);
  assert.strictEqual(result[0].forecast, 0.3);
});

test('null actual/estimate/previous stay null, never coerced to 0 or undefined', () => {
  const raw = [{ event: 'Upcoming release', date: '2026-02-01 08:00:00', country: 'GB', actual: null, estimate: null, previous: null, impact: 'High' }];
  const result = normalizeEconomicEvents(raw);
  assert.strictEqual(result[0].actual, null);
  assert.strictEqual(result[0].forecast, null);
  assert.strictEqual(result[0].previous, null);
});

test('Events missing event name or date are dropped, not passed through broken', () => {
  const raw = [
    { event: '', date: '2026-01-01 00:00:00', country: 'US' },
    { event: 'Valid Event', date: null, country: 'US' },
    { event: 'Valid Event 2', date: '2026-01-01 00:00:00', country: 'US' }
  ];
  const result = normalizeEconomicEvents(raw);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].event, 'Valid Event 2');
});

test('Unrecognized country maps to null currency, not guessed', () => {
  const raw = [{ event: 'Some Release', date: '2026-01-01 00:00:00', country: 'Brazil', impact: 'Low' }];
  const result = normalizeEconomicEvents(raw);
  assert.strictEqual(result[0].currency, null);
});

test('UK and GB both map to GBP (real-world field inconsistency handled)', () => {
  const raw = [
    { event: 'A', date: '2026-01-01 00:00:00', country: 'UK' },
    { event: 'B', date: '2026-01-01 00:00:00', country: 'GB' }
  ];
  const result = normalizeEconomicEvents(raw);
  assert.strictEqual(result[0].currency, 'GBP');
  assert.strictEqual(result[1].currency, 'GBP');
});

test('Events are sorted chronologically regardless of input order', () => {
  const raw = [
    { event: 'Later', date: '2026-03-01 00:00:00', country: 'US' },
    { event: 'Earlier', date: '2026-01-01 00:00:00', country: 'US' },
    { event: 'Middle', date: '2026-02-01 00:00:00', country: 'US' }
  ];
  const result = normalizeEconomicEvents(raw);
  assert.deepStrictEqual(result.map(e => e.event), ['Earlier', 'Middle', 'Later']);
});

test('Event names are sanitized (no raw HTML angle brackets pass through)', () => {
  const raw = [{ event: '<script>bad</script> CPI', date: '2026-01-01 00:00:00', country: 'US' }];
  const result = normalizeEconomicEvents(raw);
  assert.ok(!result[0].event.includes('<'));
});

test('Empty input array returns empty output, not an error', () => {
  const result = normalizeEconomicEvents([]);
  assert.deepStrictEqual(result, []);
});

console.log('\n======================================================');
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
console.log('======================================================');
process.exitCode = failed > 0 ? 1 : 0;
