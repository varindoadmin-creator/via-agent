import assert from 'node:assert/strict';
import test from 'node:test';
import { getDataQualityCoverage } from './dataQuality.ts';

function setEnv() {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
}

const RANGE = { start: new Date('2026-01-01'), end: new Date('2026-01-02') };

test('coverage rates are computed correctly and order linkage is scoped to executed drafts only', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    const u = String(url);
    if (u.includes('wati_messages')) return new Response(JSON.stringify([
      { source: 'WEBSITE' }, { source: 'UNKNOWN' }, { source: null },
    ]), { status: 200 });
    return new Response(JSON.stringify([
      { customer_id: 'c1', zoho_object_id: 'z1', status: 'COMPLETED' },
      { customer_id: null, zoho_object_id: null, status: 'DRAFT' },
    ]), { status: 200 });
  }) as typeof fetch;
  try {
    const result = await getDataQualityCoverage(RANGE);
    assert.equal(result.attributionCoverage, 1 / 3);
    assert.equal(result.customerMappingCoverage, 0.5);
    assert.equal(result.orderLinkageCoverage, 1); // only the one COMPLETED draft counts, and it has a zoho_object_id
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('an empty range never divides by zero — coverage rates come back null', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response('[]', { status: 200 })) as typeof fetch;
  try {
    const result = await getDataQualityCoverage(RANGE);
    assert.equal(result.attributionCoverage, null);
    assert.equal(result.customerMappingCoverage, null);
    assert.equal(result.orderLinkageCoverage, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
