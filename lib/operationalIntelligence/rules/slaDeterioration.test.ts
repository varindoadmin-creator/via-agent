import assert from 'node:assert/strict';
import test from 'node:test';
import { detectSlaDeterioration } from './slaDeterioration.ts';

function setEnv() {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  process.env.OPERATIONAL_MIN_SAMPLE_SIZE = '10';
}

const RANGE = { start: new Date('2026-01-08'), end: new Date('2026-01-15') };
const PREV_RANGE = { start: new Date('2026-01-01'), end: new Date('2026-01-08') };

// Every row is resolved (never relies on "now" as an SLA reference point, so
// the test's outcome only depends on the deliberately-chosen resolution
// durations, not on when the test happens to run).
function conversationRows(count: number, compliantCount: number) {
  const rows = [];
  for (let i = 0; i < count; i++) {
    const compliant = i < compliantCount;
    rows.push({
      customer_phone_normalized: String(i), state: 'RESOLVED',
      handoff_created_at: '2026-01-10T00:00:00Z',
      resolved_at: compliant ? '2026-01-10T00:05:00Z' : '2026-01-10T02:00:00Z', // 5 min (ON_TIME) vs 120 min (BREACHED)
      handoff_reason: 'CUSTOMER_REQUESTED_HUMAN', assigned_team: null, updated_at: '2026-01-10T02:00:00Z',
    });
  }
  return rows;
}

test('Test 123 — a meaningful SLA decline with sufficient sample produces a finding', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    const u = String(url);
    if (u.includes('state=in.')) return new Response('[]', { status: 200 }); // backlog snapshot query inside getCustomerServiceFunnel
    if (u.includes('gte.2026-01-08')) return new Response(JSON.stringify(conversationRows(30, 12)), { status: 200 }); // current: 40% compliant
    return new Response(JSON.stringify(conversationRows(30, 28)), { status: 200 }); // previous: ~93% compliant
  }) as typeof fetch;
  try {
    const candidates = await detectSlaDeterioration(RANGE, PREV_RANGE);
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].type, 'CUSTOMER_SERVICE_SLA_DETERIORATION');
    assert.ok((candidates[0].currentValue ?? 1) < (candidates[0].baselineValue ?? 0));
  } finally { globalThis.fetch = originalFetch; }
});

test('a stable or improving SLA never produces a deterioration finding', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    const u = String(url);
    if (u.includes('state=in.')) return new Response('[]', { status: 200 });
    return new Response(JSON.stringify(conversationRows(30, 28)), { status: 200 }); // both periods ~93% compliant
  }) as typeof fetch;
  try {
    const candidates = await detectSlaDeterioration(RANGE, PREV_RANGE);
    assert.equal(candidates.length, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test('Test 124 — a tiny handoff sample never produces an SLA-deterioration finding, even at a dramatic swing', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    const u = String(url);
    if (u.includes('state=in.')) return new Response('[]', { status: 200 });
    if (u.includes('gte.2026-01-08')) return new Response(JSON.stringify(conversationRows(3, 0)), { status: 200 });
    return new Response(JSON.stringify(conversationRows(3, 3)), { status: 200 });
  }) as typeof fetch;
  try {
    const candidates = await detectSlaDeterioration(RANGE, PREV_RANGE);
    assert.equal(candidates.length, 0);
  } finally { globalThis.fetch = originalFetch; }
});
