import assert from 'node:assert/strict';
import test from 'node:test';
import { detectVendorDeterioration } from './vendorDeterioration.ts';

function setEnv() {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
}

const RANGE = { start: new Date('2026-01-08'), end: new Date('2026-01-15') };
const PREV_RANGE = { start: new Date('2026-01-01'), end: new Date('2026-01-08') };

function inquiryRows(vendor: string, count: number, responseMinutes: number, oosCount: number) {
  const rows = [];
  for (let i = 0; i < count; i++) {
    rows.push({
      id: `${vendor}-${i}`, created_at: '2026-01-10T00:00:00Z',
      closed_at: new Date(new Date('2026-01-10T00:00:00Z').getTime() + responseMinutes * 60_000).toISOString(),
      primary_source: vendor, final_availability: i < oosCount ? 'OUT_OF_STOCK' : 'AVAILABLE',
      final_source: 'VENDOR', status: 'CLOSED', requested_quantity: 5, human_required: false,
    });
  }
  return rows;
}

test('Test 125 — a vendor whose median response time materially deteriorates produces a finding with per-vendor evidence', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    const u = String(url);
    if (u.includes('gte.2026-01-08')) return new Response(JSON.stringify(inquiryRows('EDL', 20, 31, 0)), { status: 200 }); // current: 31 min
    return new Response(JSON.stringify(inquiryRows('EDL', 20, 18, 0)), { status: 200 }); // previous: 18 min
  }) as typeof fetch;
  try {
    const candidates = await detectVendorDeterioration(RANGE, PREV_RANGE);
    const responseFinding = candidates.find(c => c.type === 'VENDOR_RESPONSE_DETERIORATION');
    assert.ok(responseFinding, 'expected a VENDOR_RESPONSE_DETERIORATION finding');
    assert.equal(responseFinding?.dedupeKey, 'VENDOR_RESPONSE_DETERIORATION:EDL');
    assert.equal(responseFinding?.entityId, 'EDL');
  } finally { globalThis.fetch = originalFetch; }
});

test('a vendor with a stable response time never produces a deterioration finding', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify(inquiryRows('TAK', 20, 20, 0)), { status: 200 })) as typeof fetch;
  try {
    const candidates = await detectVendorDeterioration(RANGE, PREV_RANGE);
    assert.equal(candidates.length, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test('a vendor OOS-rate increase produces its own dedicated finding, distinct from response-time', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    const u = String(url);
    if (u.includes('gte.2026-01-08')) return new Response(JSON.stringify(inquiryRows('EDL', 20, 18, 15)), { status: 200 }); // current: 75% OOS
    return new Response(JSON.stringify(inquiryRows('EDL', 20, 18, 2)), { status: 200 }); // previous: 10% OOS
  }) as typeof fetch;
  try {
    const candidates = await detectVendorDeterioration(RANGE, PREV_RANGE);
    const oosFinding = candidates.find(c => c.type === 'VENDOR_OOS_DETERIORATION');
    assert.ok(oosFinding, 'expected a VENDOR_OOS_DETERIORATION finding');
    assert.equal(oosFinding?.dedupeKey, 'VENDOR_OOS_DETERIORATION:EDL');
  } finally { globalThis.fetch = originalFetch; }
});
