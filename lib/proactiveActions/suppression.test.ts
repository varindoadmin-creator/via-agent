import assert from 'node:assert/strict';
import test from 'node:test';
import { detectOptOutIntent, isSuppressed } from './suppression.ts';

test('Test 40 — a broad opt-out phrase is classified as scope ALL', () => {
  for (const text of ['stop', 'tolong berhenti kirim pesan', 'unsubscribe', 'tidak mau dihubungi lagi']) {
    const result = detectOptOutIntent(text);
    assert.equal(result.isOptOut, true, `expected "${text}" to be detected`);
    assert.equal(result.scope, 'ALL');
  }
});

test('a narrower "stop promos" phrase is classified as scope MARKETING only', () => {
  const result = detectOptOutIntent('jangan kirim promo lagi ya');
  assert.equal(result.isOptOut, true);
  assert.equal(result.scope, 'MARKETING');
});

test('an ordinary negative reply is never treated as a global opt-out', () => {
  for (const text of ['tidak, harganya terlalu mahal', 'belum butuh sekarang', 'nanti saja']) {
    const result = detectOptOutIntent(text);
    assert.equal(result.isOptOut, false, `expected "${text}" to NOT be detected as opt-out`);
  }
});

test('isSuppressed checks the ALL scope for SERVICE_MESSAGE regardless of a MARKETING-only opt-out', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    const u = String(url);
    // Only ALL-scope rows exist for a bare SERVICE_MESSAGE check in this test.
    return new Response(u.includes('scope=in.(ALL)') ? '[]' : '[{"id":"sup-1"}]', { status: 200 });
  }) as typeof fetch;
  try {
    const serviceSuppressed = await isSuppressed('628123', 'SERVICE_MESSAGE');
    assert.equal(serviceSuppressed, false);
  } finally { globalThis.fetch = original; }
});
