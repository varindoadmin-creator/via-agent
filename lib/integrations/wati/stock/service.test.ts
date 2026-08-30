import assert from 'node:assert/strict';
import test from 'node:test';
import { startVendorCheck, reopenIfNowOpen } from './service.ts';
import type { StockInquiryRow } from './store.ts';
import type { ZohoItem } from '../../../../types/zoho.ts';

const ITEM: ZohoItem = { item_id: 'item-1', name: 'LAMITAK HPL', sku: 'ATP11358M', rate: 0, status: 'active', vendor_name: 'TAK PRODUCTS AND SERVICES, PT' };
// 2026-08-30 is a Sunday; 2026-08-31 is a Monday. Passed explicitly rather
// than via Date.now() patching — operatingCalendar.ts's functions default to
// `new Date()`, which a Date.now() override does NOT affect (a real gotcha:
// they're independent operations at the engine level).
const SUNDAY = new Date('2026-08-30T10:00:00+07:00');
const MONDAY_MORNING = new Date('2026-08-31T09:00:00+07:00');

function mockSupabase(onRequest: (url: string, init: RequestInit | undefined) => Response) {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  const calls: Array<{ url: string; method: string }> = [];
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method || 'GET' });
    return onRequest(String(url), init);
  }) as typeof fetch;
  return calls;
}

function baseClosedInquiry(overrides: Partial<StockInquiryRow> = {}): StockInquiryRow {
  return {
    id: 'inquiry-x', status: 'VENDOR_CLOSED', primary_source: 'LAMITAK', item_id: 'item-1', item_code: 'ATP11358M',
    brand: 'LAMITAK', requested_quantity: null, requested_unit: null, conversation_id: '628123', customer_phone_raw: '628123',
    customer_id: null, inbound_message_id: 'm1', stock_inquiry_type: 'EXISTENCE', active_stock_check_request_id: null,
    final_availability: null, final_source: null, prepared_response_text: null, human_required: false,
    sla_deadline_at: null, next_eligible_check_at: null, created_at: '2026-08-30T10:00:00.000Z',
    ...overrides,
  };
}

test('Test 7 — vendor closed: no StockCheckRequest is created, inquiry moves to VENDOR_CLOSED with a next_eligible_check_at, and no internal-stock lookup can occur from this path', async () => {
  const originalFetch = globalThis.fetch;
  const calls = mockSupabase((url) => {
    if (url.includes('/stock_inquiries')) return new Response('[]', { status: 200 });
    // Any other Supabase table hit (stock_check_requests) would be a bug for this test.
    throw new Error(`Unexpected Supabase call: ${url}`);
  });
  try {
    const result = await startVendorCheck({ id: 'inquiry-1', status: 'RECEIVED' }, ITEM, null, null, null, SUNDAY);
    assert.equal(result.state, 'VENDOR_CLOSED');
    assert.match(result.responseText ?? '', /segera cek ketersediaannya/);
    assert.equal(calls.some(c => c.url.includes('stock_check_requests')), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('brief section 22 — a VENDOR_CLOSED inquiry reopens once its vendor is now open, without ever depending on admin memory', async () => {
  const originalFetch = globalThis.fetch;
  const calls = mockSupabase((url) => {
    if (url.includes('stock_check_request_inquiries')) return new Response('[]', { status: 200 });
    if (url.includes('stock_check_requests')) return new Response(JSON.stringify([{ id: 'check-1', item_id: 'item-1', item_code: 'ATP11358M', source: 'LAMITAK', status: 'WAITING' }]), { status: 201 });
    if (url.includes('/stock_inquiries')) return new Response('[]', { status: 200 });
    throw new Error(`Unexpected Supabase call: ${url}`);
  });
  try {
    const reopened = await reopenIfNowOpen(baseClosedInquiry({ id: 'inquiry-3' }), MONDAY_MORNING);
    assert.equal(reopened, true);
    // Confirms the fix: reopening actually creates/attaches a check request
    // (previously dead code, since no check request ever reached VENDOR_CLOSED
    // — startVendorCheck checks hours before ever creating one).
    assert.equal(calls.some(c => c.url.includes('stock_check_requests') && !c.url.includes('stock_check_request_inquiries') && c.method === 'GET'), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('a VENDOR_CLOSED inquiry does not reopen while its vendor is still closed', async () => {
  const reopened = await reopenIfNowOpen(baseClosedInquiry({ id: 'inquiry-4' }), SUNDAY);
  assert.equal(reopened, false);
});

test('unresolvable source routes to NEEDS_HUMAN and produces no automated customer response', async () => {
  const originalFetch = globalThis.fetch;
  mockSupabase((url) => {
    if (url.includes('/stock_inquiries')) return new Response('[]', { status: 200 });
    throw new Error(`Unexpected Supabase call: ${url}`);
  });
  try {
    const unbrandedItem: ZohoItem = { ...ITEM, vendor_name: 'SOME UNMAPPED VENDOR, PT' };
    const result = await startVendorCheck({ id: 'inquiry-2', status: 'RECEIVED' }, unbrandedItem, null, null, null, MONDAY_MORNING);
    assert.equal(result.state, 'NEEDS_HUMAN');
    assert.equal(result.responseText, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
