import assert from 'node:assert/strict';
import test from 'node:test';
import { getOnboardingFunnel, getIdentityFriction } from './onboardingAnalytics.ts';

function setEnv() {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
}

const RANGE = { start: new Date('2026-01-01'), end: new Date('2026-01-02') };

test('Test 67 — a "new customer" is a Zoho customer created through onboarding, never every unknown WhatsApp number', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    const u = String(url);
    if (u.includes('customer_channel_identities')) return new Response(JSON.stringify([
      { id: 'a', source: 'ONBOARDING_CREATED', relationship_status: 'VERIFIED', created_at: '2026-01-01T00:00:00Z' },
      { id: 'b', source: 'ZOHO_CONTACT_MATCH', relationship_status: 'VERIFIED', created_at: '2026-01-01T00:00:00Z' },
    ]), { status: 200 });
    return new Response(JSON.stringify([
      { id: '1', status: 'CUSTOMER_CREATED', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:20:00Z', duplicate_check_status: null },
      { id: '2', status: 'FAILED', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:05:00Z', duplicate_check_status: 'LIKELY_DUPLICATE' },
    ]), { status: 200 });
  }) as typeof fetch;
  try {
    const result = await getOnboardingFunnel(RANGE);
    assert.equal(result.onboardingStarted, 2);
    assert.equal(result.onboardingCompleted, 1);
    assert.equal(result.onboardingAbandoned, 1);
    assert.equal(result.duplicateDetected, 1);
    assert.equal(result.completionRate, 0.5);
    assert.equal(result.newCustomersCreated, 1);
    assert.equal(result.existingZohoMatchCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('an empty range never divides by zero', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response('[]', { status: 200 })) as typeof fetch;
  try {
    const result = await getOnboardingFunnel(RANGE);
    assert.equal(result.completionRate, null);
    assert.equal(result.medianOnboardingMinutes, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('identity friction rate counts phones mapped to exactly one customer as friction-free', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify([
    { normalized_phone: '+6281111111' },
    { normalized_phone: '+6282222222' },
    { normalized_phone: '+6282222222' },
  ]), { status: 200 })) as typeof fetch;
  try {
    const result = await getIdentityFriction(RANGE);
    assert.equal(result.singleCustomerAutoResolutionRate, 0.5);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
