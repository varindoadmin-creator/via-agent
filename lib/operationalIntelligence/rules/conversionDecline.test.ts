import assert from 'node:assert/strict';
import test from 'node:test';
import { detectConversionDecline } from './conversionDecline.ts';

function setEnv() {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
}

const RANGE = { start: new Date('2026-01-08'), end: new Date('2026-01-15') };
const PREV_RANGE = { start: new Date('2026-01-01'), end: new Date('2026-01-08') };

function draftRows(count: number, executedCount: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `d${i}`, type: 'SALES_ORDER', status: i < executedCount ? 'COMPLETED' : 'READY_FOR_REVIEW',
    zoho_object_id: i < executedCount ? `so-${i}` : null, zoho_object_number: null, total: i < executedCount ? 1_000_000 : null,
    created_at: '2026-01-10T00:00:00Z',
  }));
}

test('Test 132 — a meaningful draft-to-order conversion decline with sufficient sample produces a finding', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    const u = String(url);
    if (u.includes('gte.2026-01-08')) return new Response(JSON.stringify(draftRows(20, 4)), { status: 200 }); // current: 20% conversion
    return new Response(JSON.stringify(draftRows(20, 12)), { status: 200 }); // previous: 60% conversion
  }) as typeof fetch;
  try {
    const candidates = await detectConversionDecline(RANGE, PREV_RANGE);
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].type, 'CONVERSION_DECLINE');
  } finally { globalThis.fetch = originalFetch; }
});

test('a stable conversion rate never produces a finding', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify(draftRows(20, 10)), { status: 200 })) as typeof fetch;
  try {
    const candidates = await detectConversionDecline(RANGE, PREV_RANGE);
    assert.equal(candidates.length, 0);
  } finally { globalThis.fetch = originalFetch; }
});
