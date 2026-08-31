import assert from 'node:assert/strict';
import test from 'node:test';
import { getCommercialFunnel } from './funnel.ts';

function setEnv() {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
}

test('Test 93 — a draft that executed into a real Zoho Sales Order counts as exactly one conversion', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify([
    { id: 'd1', type: 'SALES_ORDER', status: 'COMPLETED', zoho_object_id: 'SO-1', zoho_object_number: 'SO-00001', total: 1_000_000, created_at: '2026-01-01T00:00:00Z' },
  ]), { status: 200 })) as typeof fetch;
  try {
    const result = await getCommercialFunnel({ start: new Date('2026-01-01'), end: new Date('2026-02-01') });
    assert.equal(result.ordersCreated, 1);
    assert.equal(result.soValue, 1_000_000);
    assert.equal(result.draftToOrderConversion, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Test 94 — a draft with no zoho_object_id is never counted as an executed order (an unlinked Zoho order is never falsely attributed the other way either, since this only reads commercial_drafts, never all Zoho orders)', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify([
    { id: 'd1', type: 'SALES_ORDER', status: 'READY_FOR_REVIEW', zoho_object_id: null, zoho_object_number: null, total: null, created_at: '2026-01-01T00:00:00Z' },
  ]), { status: 200 })) as typeof fetch;
  try {
    const result = await getCommercialFunnel({ start: new Date('2026-01-01'), end: new Date('2026-02-01') });
    assert.equal(result.ordersCreated, 0);
    assert.equal(result.soValue, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('a cancelled draft is excluded from the conversion denominator', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify([
    { id: 'd1', type: 'SALES_ORDER', status: 'CANCELLED', zoho_object_id: null, zoho_object_number: null, total: null, created_at: '2026-01-01T00:00:00Z' },
    { id: 'd2', type: 'SALES_ORDER', status: 'COMPLETED', zoho_object_id: 'SO-2', zoho_object_number: 'SO-00002', total: 500_000, created_at: '2026-01-01T00:00:00Z' },
  ]), { status: 200 })) as typeof fetch;
  try {
    const result = await getCommercialFunnel({ start: new Date('2026-01-01'), end: new Date('2026-02-01') });
    assert.equal(result.draftToOrderConversion, 1); // 1 order / 1 eligible (cancelled excluded)
  } finally {
    globalThis.fetch = originalFetch;
  }
});
