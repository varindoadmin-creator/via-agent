import assert from 'node:assert/strict';
import test from 'node:test';
import { getStockAnalytics, getVendorPerformance } from './stockAnalytics.ts';

function setEnv() {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
}

const RANGE = { start: new Date('2026-01-01'), end: new Date('2026-01-02') };

test('OOS rate, fallback rate, and escalation rate are computed as safe rates, never a raw stock quantity', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify([
    { id: '1', created_at: '2026-01-01T00:00:00Z', closed_at: '2026-01-01T00:10:00Z', primary_source: 'VENDOR_A', final_availability: 'OUT_OF_STOCK', final_source: 'VENDOR', status: 'CLOSED', requested_quantity: 10, human_required: false },
    { id: '2', created_at: '2026-01-01T00:00:00Z', closed_at: '2026-01-01T00:20:00Z', primary_source: 'VENDOR_A', final_availability: 'AVAILABLE', final_source: 'VARINDO_INTERNAL', status: 'CLOSED', requested_quantity: 5, human_required: true },
  ]), { status: 200 })) as typeof fetch;
  try {
    const result = await getStockAnalytics(RANGE);
    assert.equal(result.inquiryCount, 2);
    assert.equal(result.oosRate, 0.5);
    assert.equal(result.varindoFallbackRate, 0.5);
    assert.equal(result.humanEscalationRate, 0.5);
    assert.equal(result.medianResponseMinutes, 15);
    assert.ok(!('quantity' in result));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('an empty range never divides by zero — rates come back null, not NaN/Infinity', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response('[]', { status: 200 })) as typeof fetch;
  try {
    const result = await getStockAnalytics(RANGE);
    assert.equal(result.oosRate, null);
    assert.equal(result.noResponseRate, null);
    assert.equal(result.varindoFallbackRate, null);
    assert.equal(result.humanEscalationRate, null);
    assert.equal(result.medianResponseMinutes, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Test 95 — vendor performance is broken down only by vendors actually present in real data, never a guessed/incomplete list', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify([
    { id: '1', created_at: '2026-01-01T00:00:00Z', closed_at: '2026-01-01T00:10:00Z', primary_source: 'VENDOR_A', final_availability: 'AVAILABLE', final_source: 'VENDOR', status: 'CLOSED', requested_quantity: 10, human_required: false },
    { id: '2', created_at: '2026-01-01T00:00:00Z', closed_at: '2026-01-01T00:30:00Z', primary_source: 'VENDOR_B', final_availability: 'OUT_OF_STOCK', final_source: 'VENDOR', status: 'CLOSED', requested_quantity: 5, human_required: false },
  ]), { status: 200 })) as typeof fetch;
  try {
    const result = await getVendorPerformance(RANGE);
    assert.equal(result.length, 2);
    const vendorA = result.find(v => v.vendor === 'VENDOR_A');
    const vendorB = result.find(v => v.vendor === 'VENDOR_B');
    assert.equal(vendorA?.availableRate, 1);
    assert.equal(vendorB?.oosRate, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
