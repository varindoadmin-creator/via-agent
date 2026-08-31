import assert from 'node:assert/strict';
import test from 'node:test';
import { detectHighDemandLowAvailability } from './highDemandLowAvailability.ts';

function setEnv() {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  process.env.OPPORTUNITY_DETECTION_ENABLED = 'true';
}

const RANGE = { start: new Date('2026-01-08'), end: new Date('2026-01-15') };

test('Test 126 — a high-inquiry-volume product with a high unavailability rate produces an opportunity finding, never a purchase action', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  const rows = [
    ...Array.from({ length: 46 }, (_, i) => ({ item_code: 'ATP11358M', final_availability: i < 16 ? 'OUT_OF_STOCK' : 'AVAILABLE' })), // 35% OOS, high volume
    ...Array.from({ length: 3 }, () => ({ item_code: 'OTHER1', final_availability: 'AVAILABLE' })),
    ...Array.from({ length: 2 }, () => ({ item_code: 'OTHER2', final_availability: 'AVAILABLE' })),
  ];
  globalThis.fetch = (async () => new Response(JSON.stringify(rows), { status: 200 })) as typeof fetch;
  try {
    const candidates = await detectHighDemandLowAvailability(RANGE);
    const finding = candidates.find(c => c.entityId === 'ATP11358M');
    assert.ok(finding, 'expected a HIGH_DEMAND_LOW_AVAILABILITY finding for the high-volume product');
    assert.equal(finding?.type, 'HIGH_DEMAND_LOW_AVAILABILITY');
    // The brief's own instruction: never prescribe a purchase quantity.
    assert.ok(!/\bpurchase\s+\d/i.test(finding?.recommendationText ?? ''));
    assert.ok(finding?.recommendedActionType === 'REVIEW_STOCKING_STRATEGY');
  } finally { globalThis.fetch = originalFetch; }
});

test('a low-volume product never produces this finding, even at 100% OOS', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  const rows = [
    ...Array.from({ length: 3 }, () => ({ item_code: 'RARE1', final_availability: 'OUT_OF_STOCK' })),
    ...Array.from({ length: 40 }, () => ({ item_code: 'COMMON1', final_availability: 'AVAILABLE' })),
  ];
  globalThis.fetch = (async () => new Response(JSON.stringify(rows), { status: 200 })) as typeof fetch;
  try {
    const candidates = await detectHighDemandLowAvailability(RANGE);
    assert.equal(candidates.find(c => c.entityId === 'RARE1'), undefined);
  } finally { globalThis.fetch = originalFetch; }
});

test('disabled when OPPORTUNITY_DETECTION_ENABLED is off', async () => {
  const original = process.env.OPPORTUNITY_DETECTION_ENABLED;
  process.env.OPPORTUNITY_DETECTION_ENABLED = 'false';
  setEnv();
  process.env.OPPORTUNITY_DETECTION_ENABLED = 'false';
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response('[]', { status: 200 })) as typeof fetch;
  try {
    const candidates = await detectHighDemandLowAvailability(RANGE);
    assert.equal(candidates.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (original !== undefined) process.env.OPPORTUNITY_DETECTION_ENABLED = original; else delete process.env.OPPORTUNITY_DETECTION_ENABLED;
  }
});
