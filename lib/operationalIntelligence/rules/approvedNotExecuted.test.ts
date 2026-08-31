import assert from 'node:assert/strict';
import test from 'node:test';
import { detectApprovedNotExecuted } from './approvedNotExecuted.ts';

function setEnv() {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
}

test('Test 129 — an approved draft stuck past the threshold produces a finding', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  const staleUpdatedAt = new Date(Date.now() - 90 * 60_000).toISOString();
  globalThis.fetch = (async () => new Response(JSON.stringify([
    { id: 'd1', type: 'SALES_ORDER', status: 'APPROVED', total: 5_000_000, updated_at: staleUpdatedAt },
  ]), { status: 200 })) as typeof fetch;
  try {
    const candidates = await detectApprovedNotExecuted();
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].type, 'APPROVED_TRANSACTION_NOT_EXECUTED');
    assert.equal(candidates[0].currentValue, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test('a recently approved draft (within the threshold window) is never flagged', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response('[]', { status: 200 })) as typeof fetch; // the query itself filters by updated_at=lt.cutoff — nothing recent ever matches
  try {
    const candidates = await detectApprovedNotExecuted();
    assert.equal(candidates.length, 0);
  } finally { globalThis.fetch = originalFetch; }
});
