import assert from 'node:assert/strict';
import test from 'node:test';
import { computeCaseWaitingBreakdown, aggregateWaitingBreakdowns } from './waitingTimeBreakdown.ts';

function setEnv() {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
}

test('Test 97 — vendor and internal windows are summed independently, customer time is the non-negative remainder, no double-count', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    const u = String(url);
    if (u.includes('stock_inquiries')) return new Response(JSON.stringify([{ created_at: '2026-01-01T00:00:00Z', closed_at: '2026-01-01T00:30:00Z', primary_source: 'EDL' }]), { status: 200 });
    if (u.includes('commercial_drafts')) return new Response(JSON.stringify([{ created_at: '2026-01-01T01:00:00Z', updated_at: '2026-01-01T01:20:00Z', status: 'WAITING_FOR_APPROVAL' }]), { status: 200 });
    return new Response('[]', { status: 200 });
  }) as typeof fetch;
  try {
    const result = await computeCaseWaitingBreakdown({ conversationId: '234567890', handoffCreatedAt: '2026-01-01T00:00:00Z', resolvedAt: '2026-01-01T02:00:00Z' });
    assert.equal(result.totalMinutes, 120);
    assert.equal(result.vendorMinutes, 30);
    assert.equal(result.internalMinutes, 20);
    assert.equal(result.customerMinutes, 70); // 120 - 30 - 20
    assert.equal(result.vendorMinutes + result.internalMinutes + result.customerMinutes, result.totalMinutes);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('vendor/internal time exceeding total duration never produces a negative customer remainder', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    const u = String(url);
    if (u.includes('stock_inquiries')) return new Response(JSON.stringify([{ created_at: '2026-01-01T00:00:00Z', closed_at: '2026-01-01T05:00:00Z', primary_source: 'EDL' }]), { status: 200 });
    return new Response('[]', { status: 200 });
  }) as typeof fetch;
  try {
    const result = await computeCaseWaitingBreakdown({ conversationId: '234567890', handoffCreatedAt: '2026-01-01T00:00:00Z', resolvedAt: '2026-01-01T02:00:00Z' });
    assert.equal(result.customerMinutes, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('aggregateWaitingBreakdowns sums each component across multiple cases', () => {
  const result = aggregateWaitingBreakdowns([
    { vendorMinutes: 10, internalMinutes: 5, customerMinutes: 20, totalMinutes: 35 },
    { vendorMinutes: 15, internalMinutes: 0, customerMinutes: 10, totalMinutes: 25 },
  ]);
  assert.equal(result.vendorMinutes, 25);
  assert.equal(result.totalMinutes, 60);
});
