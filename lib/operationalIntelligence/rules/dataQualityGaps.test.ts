import assert from 'node:assert/strict';
import test from 'node:test';
import { detectDataQualityGaps } from './dataQualityGaps.ts';

function setEnv() {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
}

const RANGE = { start: new Date('2026-01-08'), end: new Date('2026-01-15') };

test('Test 133 — low source attribution coverage produces a data-quality finding, not a confident source-performance claim', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    const u = String(url);
    if (u.includes('wati_messages')) {
      // 31% attribution coverage, per the brief's own example.
      return new Response(JSON.stringify([
        ...Array.from({ length: 31 }, () => ({ source: 'WEBSITE' })),
        ...Array.from({ length: 69 }, () => ({ source: 'UNKNOWN' })),
      ]), { status: 200 });
    }
    return new Response('[]', { status: 200 });
  }) as typeof fetch;
  try {
    const candidates = await detectDataQualityGaps(RANGE);
    const finding = candidates.find(c => c.type === 'ATTRIBUTION_COVERAGE_GAP');
    assert.ok(finding, 'expected an ATTRIBUTION_COVERAGE_GAP finding');
    // This finding itself must never be presented at HIGH confidence — brief section 70.
    assert.equal(finding?.confidence, 'LOW');
  } finally { globalThis.fetch = originalFetch; }
});

test('healthy coverage across all three dimensions produces no finding', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    const u = String(url);
    if (u.includes('wati_messages')) return new Response(JSON.stringify(Array.from({ length: 20 }, () => ({ source: 'WEBSITE' }))), { status: 200 });
    if (u.includes('commercial_drafts')) return new Response(JSON.stringify(Array.from({ length: 20 }, () => ({ customer_id: 'c1', zoho_object_id: 'z1', status: 'COMPLETED' }))), { status: 200 });
    return new Response('[]', { status: 200 });
  }) as typeof fetch;
  try {
    const candidates = await detectDataQualityGaps(RANGE);
    assert.equal(candidates.length, 0);
  } finally { globalThis.fetch = originalFetch; }
});
