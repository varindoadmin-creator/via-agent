import assert from 'node:assert/strict';
import test from 'node:test';
import { detectBacklogRisk } from './backlogRisk.ts';

function setEnv() {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
}

test('Test 7 — a rising, increasingly unassigned backlog produces a finding with age evidence', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  const oldHandoff = new Date(Date.now() - 39 * 60_000).toISOString();
  const rows = [
    ...Array.from({ length: 15 }, (_, i) => ({ customer_phone_normalized: `u${i}`, assigned_role: null, handoff_created_at: oldHandoff })),
    ...Array.from({ length: 26 }, (_, i) => ({ customer_phone_normalized: `a${i}`, assigned_role: 'admin', handoff_created_at: oldHandoff })),
  ];
  globalThis.fetch = (async () => new Response(JSON.stringify(rows), { status: 200 })) as typeof fetch;
  try {
    const candidates = await detectBacklogRisk();
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].currentValue, 41);
    const unassigned = candidates[0].evidence.find(e => e.metricKey === 'unassigned_backlog');
    assert.equal(unassigned?.currentValue, 15);
  } finally { globalThis.fetch = originalFetch; }
});

test('a small, healthy backlog never produces a finding', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify([
    { customer_phone_normalized: 'a', assigned_role: 'admin', handoff_created_at: new Date().toISOString() },
  ]), { status: 200 })) as typeof fetch;
  try {
    const candidates = await detectBacklogRisk();
    assert.equal(candidates.length, 0);
  } finally { globalThis.fetch = originalFetch; }
});
