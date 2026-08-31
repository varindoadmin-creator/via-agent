import assert from 'node:assert/strict';
import test from 'node:test';
import { getCustomerServiceFunnel } from './customerServiceAnalytics.ts';

function setEnv() {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
}

test('conversations with no handoff at all are counted as auto-resolved', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    const u = String(url);
    if (u.includes('state=in.')) return new Response('[]', { status: 200 }); // backlog snapshot
    return new Response(JSON.stringify([
      { customer_phone_normalized: '1', state: 'AUTO', handoff_created_at: null, resolved_at: null, handoff_reason: null, assigned_team: null, updated_at: '2026-01-01T00:00:00Z' },
      { customer_phone_normalized: '2', state: 'RESOLVED', handoff_created_at: '2026-01-01T00:00:00Z', resolved_at: '2026-01-01T00:30:00Z', handoff_reason: 'CUSTOMER_REQUESTED_HUMAN', assigned_team: 'CUSTOMER_SERVICE', updated_at: '2026-01-01T00:30:00Z' },
    ]), { status: 200 });
  }) as typeof fetch;
  try {
    const result = await getCustomerServiceFunnel({ start: new Date('2026-01-01'), end: new Date('2026-01-02') });
    assert.equal(result.inboundConversations, 2);
    assert.equal(result.handoffCount, 1);
    assert.equal(result.autoResolutionRate, 0.5);
    assert.equal(result.humanResolvedCount, 1);
    assert.equal(result.humanResolutionRate, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('an empty range never divides by zero — rates come back null, not NaN/Infinity', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response('[]', { status: 200 })) as typeof fetch;
  try {
    const result = await getCustomerServiceFunnel({ start: new Date('2026-01-01'), end: new Date('2026-01-02') });
    assert.equal(result.autoResolutionRate, null);
    assert.equal(result.humanResolutionRate, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
