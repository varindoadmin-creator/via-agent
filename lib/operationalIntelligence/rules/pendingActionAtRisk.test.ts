import assert from 'node:assert/strict';
import test from 'node:test';
import { detectPendingActionAtRisk } from './pendingActionAtRisk.ts';

function setEnv() {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
}

test('Test 128 — a vendor response with no conversation activity since is flagged as pending action at risk', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  const oldEnoughClosedAt = new Date(Date.now() - 30 * 60_000).toISOString(); // 30 min ago (past the 20-min default threshold)
  const staleUpdatedAt = new Date(Date.now() - 40 * 60_000).toISOString(); // conversation last touched BEFORE the vendor responded
  globalThis.fetch = (async (url: string) => {
    const u = String(url);
    if (u.includes('wati_conversation_state') && u.includes('customer_phone_normalized=in.')) {
      return new Response(JSON.stringify([{ customer_phone_normalized: 'c1', updated_at: staleUpdatedAt }]), { status: 200 });
    }
    if (u.includes('state=eq.NEEDS_HUMAN')) return new Response('[]', { status: 200 });
    if (u.includes('stock_inquiries')) return new Response(JSON.stringify([{ id: 'i1', conversation_id: 'c1', closed_at: oldEnoughClosedAt }]), { status: 200 });
    return new Response('[]', { status: 200 });
  }) as typeof fetch;
  try {
    const candidates = await detectPendingActionAtRisk();
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].type, 'PENDING_ACTION_AT_RISK');
    const evidence = candidates[0].evidence.find(e => e.metricKey === 'vendor_responded_customer_not_updated');
    assert.equal(evidence?.currentValue, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test('a vendor response followed by real conversation activity is never flagged', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  const closedAt = new Date(Date.now() - 30 * 60_000).toISOString();
  const freshUpdatedAt = new Date(Date.now() - 5 * 60_000).toISOString(); // conversation updated AFTER the vendor responded
  globalThis.fetch = (async (url: string) => {
    const u = String(url);
    if (u.includes('customer_phone_normalized=in.')) return new Response(JSON.stringify([{ customer_phone_normalized: 'c1', updated_at: freshUpdatedAt }]), { status: 200 });
    if (u.includes('state=eq.NEEDS_HUMAN')) return new Response('[]', { status: 200 });
    if (u.includes('stock_inquiries')) return new Response(JSON.stringify([{ id: 'i1', conversation_id: 'c1', closed_at: closedAt }]), { status: 200 });
    return new Response('[]', { status: 200 });
  }) as typeof fetch;
  try {
    const candidates = await detectPendingActionAtRisk();
    assert.equal(candidates.length, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test('an unassigned NEEDS_HUMAN case past the threshold is also flagged', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  const oldHandoff = new Date(Date.now() - 45 * 60_000).toISOString();
  globalThis.fetch = (async (url: string) => {
    const u = String(url);
    if (u.includes('state=eq.NEEDS_HUMAN')) return new Response(JSON.stringify([{ customer_phone_normalized: 'c2', handoff_created_at: oldHandoff, assigned_role: null }]), { status: 200 });
    return new Response('[]', { status: 200 });
  }) as typeof fetch;
  try {
    const candidates = await detectPendingActionAtRisk();
    assert.equal(candidates.length, 1);
    const evidence = candidates[0].evidence.find(e => e.metricKey === 'unassigned_too_long');
    assert.equal(evidence?.currentValue, 1);
  } finally { globalThis.fetch = originalFetch; }
});
