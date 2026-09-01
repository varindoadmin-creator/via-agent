import assert from 'node:assert/strict';
import test from 'node:test';
import { triggerHandoff } from './handoff.ts';

function setEnv() {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
}

test('Test 80 — customer-requested-human creates a new NEEDS_HUMAN episode with the right reason/team', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  let capturedBody: Record<string, unknown> | null = null;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('wati_conversation_state') && (!init?.method || init.method === 'GET')) return new Response('[]', { status: 200 });
    if (u.includes('wati_conversation_state') && init?.method === 'POST') {
      capturedBody = JSON.parse(String(init.body));
      return new Response(JSON.stringify([{ customer_phone_normalized: '234567890', ...capturedBody }]), { status: 201 });
    }
    return new Response('[]', { status: 200 });
  }) as typeof fetch;
  try {
    const result = await triggerHandoff('234567890', 'CUSTOMER_REQUESTED_HUMAN');
    assert.equal(result.isNewEpisode, true);
    assert.equal(capturedBody!.state, 'NEEDS_HUMAN');
    assert.equal(capturedBody!.handoff_reason, 'CUSTOMER_REQUESTED_HUMAN');
    assert.equal(capturedBody!.assigned_team, 'CUSTOMER_SERVICE');
    assert.ok(capturedBody!.handoff_created_at);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Test 93 — a second trigger while already NEEDS_HUMAN is a no-op: no reset SLA clock, no reassignment, no duplicate handoff', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  const originalHandoffCreatedAt = '2026-01-01T00:00:00.000Z';
  let anyWriteHappened = false;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('wati_conversation_state') && (!init?.method || init.method === 'GET')) {
      return new Response(JSON.stringify([{
        customer_phone_normalized: '234567890', state: 'NEEDS_HUMAN', priority: 'NORMAL',
        assigned_role: null, assigned_team: 'SALES', handoff_reason: 'DISCOUNT_REQUEST',
        handoff_created_at: originalHandoffCreatedAt, human_assigned_at: null, human_first_response_at: null,
        resolved_at: null, closed_at: null, active_customer_id: null, version: 1,
      }]), { status: 200 });
    }
    anyWriteHappened = true;
    return new Response('[]', { status: 200 });
  }) as typeof fetch;
  try {
    const result = await triggerHandoff('234567890', 'DISCOUNT_REQUEST');
    assert.equal(result.isNewEpisode, false);
    assert.equal(result.case.handoff_created_at, originalHandoffCreatedAt);
    assert.equal(anyWriteHappened, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Section 13 — a COMPLAINT handoff is created at HIGH priority, routed to CUSTOMER_SERVICE', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  let capturedBody: Record<string, unknown> | null = null;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('wati_conversation_state') && (!init?.method || init.method === 'GET')) return new Response('[]', { status: 200 });
    if (u.includes('wati_conversation_state') && init?.method === 'POST') {
      capturedBody = JSON.parse(String(init.body));
      return new Response(JSON.stringify([{ customer_phone_normalized: '234567890', ...capturedBody }]), { status: 201 });
    }
    return new Response('[]', { status: 200 });
  }) as typeof fetch;
  try {
    await triggerHandoff('234567890', 'COMPLAINT');
    assert.equal(capturedBody!.priority, 'HIGH');
    assert.equal(capturedBody!.assigned_team, 'CUSTOMER_SERVICE');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Section 50 — a special-pricing handoff routes to SALES', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  let capturedBody: Record<string, unknown> | null = null;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('wati_conversation_state') && (!init?.method || init.method === 'GET')) return new Response('[]', { status: 200 });
    if (u.includes('wati_conversation_state') && init?.method === 'POST') {
      capturedBody = JSON.parse(String(init.body));
      return new Response(JSON.stringify([{ customer_phone_normalized: '234567890', ...capturedBody }]), { status: 201 });
    }
    return new Response('[]', { status: 200 });
  }) as typeof fetch;
  try {
    await triggerHandoff('234567890', 'SPECIAL_PRICING');
    assert.equal(capturedBody!.assigned_team, 'SALES');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('a new handoff episode sends a WhatsApp alert to the staff number (unconditionally, not gated to urgent reasons)', async () => {
  setEnv();
  process.env.WATI_API_TOKEN = 'test-token';
  process.env.WATI_API_BASE_URL = 'https://example.wati.io/tenant';
  process.env.CS_STAFF_WHATSAPP_NUMBER = '081288885224';
  const originalFetch = globalThis.fetch;
  let watiSendUrl: string | null = null;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('sendSessionMessage')) {
      watiSendUrl = u;
      return new Response(JSON.stringify({ ok: true, message: { statusString: 'SENT', whatsappMessageId: 'wamid.1' } }), { status: 200 });
    }
    if (u.includes('wati_conversation_state') && (!init?.method || init.method === 'GET')) return new Response('[]', { status: 200 });
    if (u.includes('wati_conversation_state') && init?.method === 'POST') {
      return new Response(JSON.stringify([{ customer_phone_normalized: '234567890', state: 'NEEDS_HUMAN' }]), { status: 201 });
    }
    return new Response('[]', { status: 200 });
  }) as typeof fetch;
  try {
    // DISCOUNT_REQUEST is NORMAL priority, not in URGENT_REASONS — the email
    // alert stays gated off for it, but the WhatsApp alert must still fire.
    await triggerHandoff('234567890', 'DISCOUNT_REQUEST');
    assert.ok(watiSendUrl, 'expected sendSessionMessage to be called');
    assert.match(watiSendUrl!, /6281288885224/);
    assert.match(decodeURIComponent(watiSendUrl!), /menunggu bantuan Admin/);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.WATI_API_TOKEN;
    delete process.env.WATI_API_BASE_URL;
    delete process.env.CS_STAFF_WHATSAPP_NUMBER;
  }
});

test('a new handoff episode still completes cleanly when the (unconditional) staff email alert fails to send, same best-effort contract as the other notification channels', async () => {
  // setEnv() deletes SMTP_USER/SMTP_PASS, so sendMail() throws inside
  // getTransporter() before any network call — the same pattern the
  // existing "Test 80" test already relies on. sendMail uses
  // nodemailer/SMTP directly (not fetch), so its content isn't observable
  // through the fetch mock the way the WhatsApp alert's is; this test only
  // confirms the new call site is wired in and doesn't break the handoff
  // when it fails, matching this file's existing convention of not
  // asserting on email content.
  setEnv();
  process.env.CS_STAFF_ALERT_EMAIL = 'admin@varindo.co.id';
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('wati_conversation_state') && (!init?.method || init.method === 'GET')) return new Response('[]', { status: 200 });
    if (u.includes('wati_conversation_state') && init?.method === 'POST') {
      return new Response(JSON.stringify([{ customer_phone_normalized: '234567890', state: 'NEEDS_HUMAN' }]), { status: 201 });
    }
    return new Response('[]', { status: 200 });
  }) as typeof fetch;
  try {
    const result = await triggerHandoff('234567890', 'DISCOUNT_REQUEST');
    assert.equal(result.isNewEpisode, true);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.CS_STAFF_ALERT_EMAIL;
  }
});

test('Section 49 — a payment-review handoff routes to FINANCE', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  let capturedBody: Record<string, unknown> | null = null;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('wati_conversation_state') && (!init?.method || init.method === 'GET')) return new Response('[]', { status: 200 });
    if (u.includes('wati_conversation_state') && init?.method === 'POST') {
      capturedBody = JSON.parse(String(init.body));
      return new Response(JSON.stringify([{ customer_phone_normalized: '234567890', ...capturedBody }]), { status: 201 });
    }
    return new Response('[]', { status: 200 });
  }) as typeof fetch;
  try {
    await triggerHandoff('234567890', 'PAYMENT_REVIEW');
    assert.equal(capturedBody!.assigned_team, 'FINANCE');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
