import assert from 'node:assert/strict';
import test from 'node:test';
import { processInboundWatiMessage } from './pipeline.ts';
import { clearTokenCache } from '../../zoho/auth.ts';

function setEnv() {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  process.env.WATI_API_TOKEN = 'test-token';
  process.env.WATI_API_BASE_URL = 'https://live-mt-server.wati.io/test-tenant';
}

function setZohoEnv() {
  process.env.ZOHO_CLIENT_ID = 'test-client';
  process.env.ZOHO_CLIENT_SECRET = 'test-secret';
  process.env.ZOHO_REFRESH_TOKEN = 'test-refresh';
  process.env.ZOHO_ORGANIZATION_ID = 'test-org';
  clearTokenCache();
}

/**
 * Phase 14, brief sections 41/46 (non-negotiable "failure is visible, not
 * silent"): forces an unhandled exception deep in the pipeline (every
 * downstream lookup — customer resolution, conversation state, Zoho — fails)
 * and asserts the customer still receives exactly one safe, jargon-free
 * message rather than total silence.
 */
test('Test — an unhandled pipeline exception still sends one safe customer-facing fallback, never silence or a stack trace', async () => {
  setEnv();
  let watiSendCount = 0;
  let watiSendUrl: string | null = null;

  const fetchMock = (async (url: string, init?: RequestInit) => {
    const u = String(url);
    const method = init?.method || 'GET';

    if (u.includes('/wati_messages') && method === 'POST') {
      return new Response(JSON.stringify([{ id: 'msg-1', customer_phone_normalized: '6281234500001' }]), { status: 200 });
    }
    if (u.includes('/wati_messages') && method === 'PATCH') {
      return new Response('[]', { status: 200 });
    }
    if (u.includes('wati.io')) {
      watiSendCount++;
      watiSendUrl = u;
      return new Response(JSON.stringify({ result: 'success' }), { status: 200 });
    }
    // `getConversationState` (lib/integrations/wati/conversationState.ts) has
    // no internal fallback and throws on a non-OK response — a reliable,
    // early, genuinely unhandled failure inside the pipeline's first
    // `Promise.all`, well before any product resolution or customer send is
    // attempted. Everything else (customer/Zoho lookups, which fail safe to
    // UNMATCHED/empty internally) returns a benign empty result so this test
    // isolates exactly one guaranteed-uncaught failure rather than relying on
    // every dependency happening to throw.
    if (u.includes('/wati_conversation_state')) {
      return new Response('Internal Server Error', { status: 500 });
    }
    return new Response('[]', { status: 200 });
  }) as typeof fetch;

  const original = globalThis.fetch;
  globalThis.fetch = fetchMock;
  try {
    const outcome = await processInboundWatiMessage({ id: 'wati-msg-fail-1', waId: '6281234500001', text: 'ATP11358M ready?', type: 'text' });
    assert.equal(outcome.status, 'failed');
    assert.equal(watiSendCount, 1, 'expected exactly one outbound WATI send attempt for the safe fallback message');
    assert.ok(watiSendUrl);
    const sentText = decodeURIComponent(new URL(watiSendUrl!).searchParams.get('messageText') ?? '');
    assert.doesNotMatch(sentText, /zoho|supabase|stack|exception|undefined|null|error:/i);
    assert.match(sentText, /maaf|kendala/i);
  } finally {
    globalThis.fetch = original;
  }
});

/**
 * Phase 14 follow-up: the real reply is sent successfully, then the
 * post-send bookkeeping write (updateWatiMessageResolution) fails. This must
 * NOT trigger the outer-catch fallback message — the customer already has
 * their correct answer, and a second "sistem kami mengalami kendala" message
 * would be confusing, not helpful. Exactly one outbound send (the real
 * greeting), never two.
 */
test('Test — a failure in post-send bookkeeping never produces a duplicate/confusing customer message', async () => {
  setEnv();
  let watiSendCount = 0;
  let watiSendUrl: string | null = null;

  const fetchMock = (async (url: string, init?: RequestInit) => {
    const u = String(url);
    const method = init?.method || 'GET';

    if (u.includes('/wati_messages') && method === 'POST') {
      return new Response(JSON.stringify([{ id: 'msg-2', customer_phone_normalized: '628999' }]), { status: 200 });
    }
    if (u.includes('/wati_messages') && method === 'PATCH') {
      // The one write that happens AFTER the real send below — simulate it failing.
      return new Response('Internal Server Error', { status: 500 });
    }
    if (u.includes('wati.io')) {
      watiSendCount++;
      watiSendUrl = u;
      return new Response(JSON.stringify({ result: 'success' }), { status: 200 });
    }
    // Every other Supabase read/write (customer resolution, conversation
    // state, context lookback, wati_conversation_state touch) succeeds with
    // a benign empty result — this test isolates the one specific failure.
    return new Response('[]', { status: 200 });
  }) as typeof fetch;

  const original = globalThis.fetch;
  globalThis.fetch = fetchMock;
  try {
    // Deliberately a short, non-normalizable phone number ("628999" fails
    // lib/customers/phoneKey.ts's normalizePhoneKey — under 8 digits): that
    // makes resolveCustomerByPhone/getConversationState short-circuit to
    // UNMATCHED/AUTO internally, WITHOUT ever reaching Zoho's real
    // getAllCustomers() call (which has no internal catch and would throw
    // "Zoho credentials are not configured" in this test environment,
    // pre-empting the very scenario this test needs — the real send
    // succeeding all the way through). A realistic full phone number would
    // correctly exercise the Zoho-outage-safe-fallback path instead (see the
    // test above), not this one's "bookkeeping fails after a real send".
    const outcome = await processInboundWatiMessage({ id: 'wati-msg-fail-2', waId: '628999', text: 'Halo', type: 'text' });
    assert.equal(outcome.status, 'processed');
    assert.equal(watiSendCount, 1, 'expected exactly one outbound send — the real greeting — even though post-send bookkeeping failed');
    assert.ok(watiSendUrl);
    const sentText = decodeURIComponent(new URL(watiSendUrl!).searchParams.get('messageText') ?? '');
    assert.doesNotMatch(sentText, /maaf.*kendala/i, 'the real greeting must not be replaced by the system-error fallback text');
  } finally {
    globalThis.fetch = original;
  }
});

/**
 * 2026-09-02 (live WABA test): an edge-band answer that resolves to exactly
 * one unambiguous Zoho-verified variant must carry THAT item forward as the
 * conversation's product context, not the panel it's for — so a follow-up
 * like "bisa beli 15 meter?" (a quantity that only makes sense for the
 * sellable edge-band SKU, not a panel sold by sheet) resolves against the
 * right item. Exercises the real pipeline end-to-end: intent detection,
 * Zoho product resolution, the website-guided edge-band discovery, Zoho
 * verification, the send, and the post-send bookkeeping write.
 */
test('Test — an unambiguous edge-band answer carries the edge-band item itself forward, not the panel', async () => {
  setEnv();
  setZohoEnv();
  let watiSendCount = 0;
  let watiSendUrl: string | null = null;
  let bookkeepingBody: Record<string, unknown> | null = null;

  const PANEL = { item_id: 'panel-1', name: "DXO 5338D - LAMITAK HPL 4'x8' | STOFFA GRIGIO", sku: 'LAM-DXO5338D', rate: 700000, status: 'active', tax_percentage: 11, vendor_name: 'TAK PRODUCTS AND SERVICES, PT' };
  const EDGE_ITEM = { item_id: 'edge-1', name: "EAP 5338R0V2/23 - NEWEDGE ABS EDGING W23MM X T1.0MM | DXO 5338D", sku: 'LAM-EAP5338R0V2/23', rate: 20000, status: 'active', tax_percentage: 11, unit: 'm' };

  const fetchMock = (async (url: string, init?: RequestInit) => {
    const u = String(url);
    const method = init?.method || 'GET';

    if (u.includes('/oauth/v2/token')) {
      return new Response(JSON.stringify({ access_token: 'fake-token', expires_in: 3600 }), { status: 200 });
    }
    if (u.includes('/contacts')) {
      return new Response(JSON.stringify({ contacts: [], page_context: { has_more_page: false } }), { status: 200 });
    }
    if (u.includes('/items/panel-1')) return new Response(JSON.stringify({ item: PANEL }), { status: 200 });
    if (u.includes('/items/edge-1')) return new Response(JSON.stringify({ item: EDGE_ITEM }), { status: 200 });
    if (u.includes('items?search_text')) {
      const q = new URL(u).searchParams.get('search_text') || '';
      if (q.includes('EAP5338R0V2')) return new Response(JSON.stringify({ items: [EDGE_ITEM] }), { status: 200 });
      if (q.includes('DXO')) return new Response(JSON.stringify({ items: [PANEL] }), { status: 200 });
      return new Response(JSON.stringify({ items: [] }), { status: 200 });
    }
    if (u.includes('varindo.co.id/products?search')) {
      return new Response(`<a aria-label="DXO 5338D - LAMITAK HPL 4'x8' | STOFFA GRIGIO" class="block" href="/products/dxo-5338d-stoffa-grigio">`, { status: 200 });
    }
    if (u.includes('varindo.co.id/products/dxo-5338d-stoffa-grigio')) {
      // Only ONE width listed — the unambiguous case this test targets.
      return new Response(`<dt>Newedge Code (23mm Width)</dt><dd class="x">EAP5338R0V2/2310/1</dd>`, { status: 200 });
    }
    if (u.includes('/wati_messages') && method === 'POST') {
      return new Response(JSON.stringify([{ id: 'msg-3', customer_phone_normalized: '6281234509999' }]), { status: 200 });
    }
    if (u.includes('/wati_messages') && method === 'PATCH') {
      bookkeepingBody = JSON.parse(String(init!.body));
      return new Response('[]', { status: 200 });
    }
    if (u.includes('wati.io') && u.includes('sendSessionMessage')) {
      watiSendCount++;
      watiSendUrl = u;
      return new Response(JSON.stringify({ ok: true, result: 'success', message: { statusString: 'SENT', whatsappMessageId: 'wamid.1' } }), { status: 200 });
    }
    return new Response('[]', { status: 200 });
  }) as typeof fetch;

  const original = globalThis.fetch;
  globalThis.fetch = fetchMock;
  try {
    const outcome = await processInboundWatiMessage({ id: 'wati-msg-edge-1', waId: '6281234509999', text: 'Apakah ada edging untuk DXO 5338D?', type: 'text' });
    assert.equal(outcome.status, 'processed');
    assert.equal(outcome.responseCase, 'EDGE_BAND_AVAILABLE');
    assert.equal(watiSendCount, 1);
    assert.ok(watiSendUrl);
    const sentText = decodeURIComponent(new URL(watiSendUrl!).searchParams.get('messageText') ?? '');
    assert.match(sentText, /EAP 5338R0V2\/23/, 'the customer-facing reply should name the real, Zoho-verified edge-band item');

    assert.ok(bookkeepingBody, 'expected the post-send bookkeeping write to have run');
    const patchedItemCode = (bookkeepingBody as Record<string, unknown>).item_code;
    assert.equal(patchedItemCode, 'LAM-EAP5338R0V2/23', 'the carried context should be the edge-band item, not the panel');
    assert.notEqual(patchedItemCode, 'LAM-DXO5338D');
  } finally {
    globalThis.fetch = original;
  }
});
