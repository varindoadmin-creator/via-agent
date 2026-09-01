import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateOutboundEligibility } from './eligibility.ts';

function setEnv() {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
}

function mockFetch({ state, suppressed, withinCooldown }: { state: string; suppressed: boolean; withinCooldown: boolean }): typeof fetch {
  return (async (url: string) => {
    const u = String(url);
    if (u.includes('/wati_conversation_state')) return new Response(JSON.stringify([{ state }]), { status: 200 });
    if (u.includes('/customer_outreach_suppressions')) return new Response(JSON.stringify(suppressed ? [{ id: 'sup-1' }] : []), { status: 200 });
    if (u.includes('/proactive_customer_actions')) return new Response(JSON.stringify(withinCooldown ? [{ sent_at: new Date().toISOString() }] : []), { status: 200 });
    return new Response('[]', { status: 200 });
  }) as typeof fetch;
}

test('Test 39 — a HUMAN_ACTIVE conversation blocks automatic outbound', async () => {
  setEnv();
  const original = globalThis.fetch;
  globalThis.fetch = mockFetch({ state: 'HUMAN_ACTIVE', suppressed: false, withinCooldown: false });
  try {
    const result = await evaluateOutboundEligibility({ customerPhoneNormalized: '628123', category: 'SALES_FOLLOW_UP' });
    assert.equal(result.eligible, false);
    assert.equal(result.reason, 'HUMAN_ACTIVE');
  } finally { globalThis.fetch = original; }
});

test('NEEDS_HUMAN and HUMAN_ASSIGNED also block automatic outbound, same as HUMAN_ACTIVE', async () => {
  setEnv();
  const original = globalThis.fetch;
  for (const state of ['NEEDS_HUMAN', 'HUMAN_ASSIGNED']) {
    globalThis.fetch = mockFetch({ state, suppressed: false, withinCooldown: false });
    const result = await evaluateOutboundEligibility({ customerPhoneNormalized: '628123', category: 'SERVICE_MESSAGE' });
    assert.equal(result.eligible, false, `expected ${state} to block`);
  }
  globalThis.fetch = original;
});

test('Test 40 — an opted-out customer blocks marketing/sales-follow-up outbound', async () => {
  setEnv();
  const original = globalThis.fetch;
  globalThis.fetch = mockFetch({ state: 'AUTO', suppressed: true, withinCooldown: false });
  try {
    const result = await evaluateOutboundEligibility({ customerPhoneNormalized: '628123', category: 'MARKETING_MESSAGE' });
    assert.equal(result.eligible, false);
    assert.equal(result.reason, 'SUPPRESSED');
  } finally { globalThis.fetch = original; }
});

test('a proactive-cooldown window blocks a second commercial contact within the window', async () => {
  setEnv();
  const original = globalThis.fetch;
  globalThis.fetch = mockFetch({ state: 'AUTO', suppressed: false, withinCooldown: true });
  try {
    const result = await evaluateOutboundEligibility({ customerPhoneNormalized: '628123', category: 'SALES_FOLLOW_UP' });
    assert.equal(result.eligible, false);
    assert.equal(result.reason, 'COOLDOWN');
  } finally { globalThis.fetch = original; }
});

test('a normal, non-suppressed, non-human-active conversation outside cooldown is eligible', async () => {
  setEnv();
  const original = globalThis.fetch;
  globalThis.fetch = mockFetch({ state: 'AUTO', suppressed: false, withinCooldown: false });
  try {
    const result = await evaluateOutboundEligibility({ customerPhoneNormalized: '628123', category: 'SALES_FOLLOW_UP' });
    assert.equal(result.eligible, true);
  } finally { globalThis.fetch = original; }
});

test('a SERVICE_MESSAGE is not blocked by cooldown even if a commercial send happened recently', async () => {
  setEnv();
  const original = globalThis.fetch;
  globalThis.fetch = mockFetch({ state: 'AUTO', suppressed: false, withinCooldown: true });
  try {
    const result = await evaluateOutboundEligibility({ customerPhoneNormalized: '628123', category: 'SERVICE_MESSAGE' });
    assert.equal(result.eligible, true);
  } finally { globalThis.fetch = original; }
});
