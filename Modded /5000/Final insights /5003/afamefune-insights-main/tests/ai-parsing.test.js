'use strict';
const assert = require('assert');

// Extracted verbatim from server.js lines 909-927 — the exact parsing block.
function parseAiResponse(rawText, savedTrade) {
  let structured = null;
  try {
    const cleaned = rawText.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
    const parsed = JSON.parse(cleaned);
    if (parsed && parsed.verdict && parsed.scores) {
      structured = parsed;
      savedTrade.aiVerdict = parsed.verdict;
      savedTrade.aiScores = {
        technical: parsed.scores.technical ?? null,
        risk: parsed.scores.risk ?? null,
        execution: parsed.scores.execution ?? null,
        psychology: parsed.scores.psychology ?? null,
        overall: parsed.scores.overall ?? null
      };
      savedTrade.aiStructured = parsed;
    }
  } catch (parseErr) {
    // swallowed exactly as in production — never breaks the response
  }
  return structured;
}

let passed = 0, failed = 0;
function test(name, cb) {
  try { cb(); console.log('PASS:', name); passed++; }
  catch (e) { console.log('FAIL:', name, '->', e.message); failed++; }
}

console.log('======================================================');
console.log('TESTING THE ACTUAL AI-response parsing block from server.js');
console.log('======================================================\n');

test('Valid JSON wrapped in ```json fences parses correctly', () => {
  const raw = '```json\n{"verdict":"Good Setup","scores":{"technical":80,"risk":70,"execution":75,"psychology":50,"overall":72},"summary":"Solid trade."}\n```';
  const trade = {};
  const structured = parseAiResponse(raw, trade);
  assert.strictEqual(structured.verdict, 'Good Setup');
  assert.strictEqual(trade.aiVerdict, 'Good Setup');
  assert.strictEqual(trade.aiScores.overall, 72);
});

test('Valid raw JSON with no fences parses correctly', () => {
  const raw = '{"verdict":"Strong Setup","scores":{"technical":90,"risk":85,"execution":88,"psychology":60,"overall":85}}';
  const trade = {};
  const structured = parseAiResponse(raw, trade);
  assert.strictEqual(structured.verdict, 'Strong Setup');
});

test('Malformed / non-JSON text falls back to null structured, never throws', () => {
  const raw = "I think this trade looks decent but I can't format it as JSON right now, sorry!";
  const trade = {};
  let threw = false;
  let structured;
  try { structured = parseAiResponse(raw, trade); } catch (e) { threw = true; }
  assert.strictEqual(threw, false, 'must never throw on bad input');
  assert.strictEqual(structured, null);
  assert.strictEqual(trade.aiVerdict, undefined, 'trade object must be untouched on parse failure');
});

test('Valid JSON but missing required fields (no verdict) falls back gracefully', () => {
  const raw = '{"summary":"Some analysis but wrong shape","notVerdict":"whatever"}';
  const trade = {};
  const structured = parseAiResponse(raw, trade);
  assert.strictEqual(structured, null);
  assert.strictEqual(trade.aiVerdict, undefined);
});

test('Valid JSON but missing scores object falls back gracefully', () => {
  const raw = '{"verdict":"Avoid"}';
  const trade = {};
  const structured = parseAiResponse(raw, trade);
  assert.strictEqual(structured, null);
});

test('Partial scores (some categories missing) default to null, not undefined/NaN', () => {
  const raw = '{"verdict":"Neutral Setup","scores":{"technical":60,"overall":55}}';
  const trade = {};
  parseAiResponse(raw, trade);
  assert.strictEqual(trade.aiScores.technical, 60);
  assert.strictEqual(trade.aiScores.risk, null);
  assert.strictEqual(trade.aiScores.psychology, null);
  assert.strictEqual(trade.aiScores.overall, 55);
});

test('Empty string input does not throw', () => {
  const trade = {};
  let threw = false;
  try { parseAiResponse('', trade); } catch (e) { threw = true; }
  assert.strictEqual(threw, false);
});

console.log('\n======================================================');
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
console.log('======================================================');
process.exitCode = failed > 0 ? 1 : 0;
