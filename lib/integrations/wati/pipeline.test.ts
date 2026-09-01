import assert from 'node:assert/strict';
import test from 'node:test';
import { processInboundWatiMessage } from './pipeline.ts';

function setEnv() {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  process.env.WATI_API_TOKEN = 'test-token';
  process.env.WATI_API_BASE_URL = 'https://live-mt-server.wati.io/test-tenant';
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
