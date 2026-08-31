import assert from 'node:assert/strict';
import test from 'node:test';
import { detectZohoWriteFailures } from './zohoWriteFailures.ts';

function setEnv() {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
}

const RANGE = { start: new Date('2026-01-08'), end: new Date('2026-01-15') };

test('Test 130 — an elevated Zoho write failure rate produces a system-reliability finding, distinguishing unknown-outcome cases', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  const rows = [
    ...Array.from({ length: 10 }, () => ({ status: 'COMPLETED', error: null })),
    ...Array.from({ length: 3 }, () => ({ status: 'FAILED', error: 'Zoho API rejected the request.' })),
    ...Array.from({ length: 2 }, () => ({ status: 'FAILED', error: 'EXECUTION_UNKNOWN: Zoho outcome could not be confirmed.' })),
  ];
  globalThis.fetch = (async () => new Response(JSON.stringify(rows), { status: 200 })) as typeof fetch;
  try {
    const candidates = await detectZohoWriteFailures(RANGE);
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].type, 'ZOHO_WRITE_FAILURES');
    const unknownEvidence = candidates[0].evidence.find(e => e.metricKey === 'zoho_write_unknown_outcome_count');
    assert.equal(unknownEvidence?.currentValue, 2);
  } finally { globalThis.fetch = originalFetch; }
});

test('a low failure rate never produces a finding', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  const rows = [...Array.from({ length: 19 }, () => ({ status: 'COMPLETED', error: null })), { status: 'FAILED', error: 'transient' }];
  globalThis.fetch = (async () => new Response(JSON.stringify(rows), { status: 200 })) as typeof fetch;
  try {
    const candidates = await detectZohoWriteFailures(RANGE);
    assert.equal(candidates.length, 0);
  } finally { globalThis.fetch = originalFetch; }
});
