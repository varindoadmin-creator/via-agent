import assert from 'node:assert/strict';
import test from 'node:test';
import { runCustomerSelfService, resumeSelfServiceAfterSelection } from './orchestrator.ts';

function setEnv() {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  process.env.USE_MOCK_ZOHO = 'true';
}
function clearEnv() {
  delete process.env.USE_MOCK_ZOHO;
}

test('Test 65 — a single resolved mapping (ONE) dispatches straight to the order-status lookup, no account question', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  let insertedPendingBody: Record<string, unknown> | null = null;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('wati_conversation_state') && (!init || init.method === 'GET' || !init.method)) return new Response(JSON.stringify([{ active_customer_id: null }]), { status: 200 });
    if (u.includes('wati_conversation_state') && init?.method === 'POST') { insertedPendingBody = JSON.parse(String(init.body)); return new Response('', { status: 201 }); }
    if (u.includes('customer_channel_identities')) return new Response(JSON.stringify([{ id: 'm1', normalized_phone: '234567890', customer_id: 'CUST-001', relationship_status: 'VERIFIED' }]), { status: 200 });
    return new Response('[]', { status: 200 });
  }) as typeof fetch;
  try {
    const result = await runCustomerSelfService({
      intent: 'ORDER_STATUS_INQUIRY', normalizedPhone: '234567890', conversationId: '234567890',
      customerPhoneRaw: '628234567890', soNumberCandidate: 'SO-00001', invoiceNumberCandidate: null, watiMessageId: 'msg-1',
    });
    assert.equal(result.responseCase, 'ORDER_STATUS_FOUND');
    assert.match(result.responseText ?? '', /SO-00001/);
    // Only one mapping existed, so the active-customer write happens, but no "which account" question is ever asked/stored.
    assert.equal(insertedPendingBody!.pending_self_service_intent, undefined);
  } finally {
    globalThis.fetch = originalFetch;
    clearEnv();
  }
});

test('Test 66 — a phone mapped to multiple customers asks which account and stores the pending question, no aggregate response', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  let pendingWrite: Record<string, unknown> | null = null;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('wati_conversation_state') && (!init?.method || init.method === 'GET')) return new Response(JSON.stringify([{ active_customer_id: null }]), { status: 200 });
    if (u.includes('wati_conversation_state') && init?.method === 'POST') { pendingWrite = JSON.parse(String(init.body)); return new Response('', { status: 201 }); }
    if (u.includes('customer_channel_identities')) {
      return new Response(JSON.stringify([
        { id: 'm1', normalized_phone: '234567890', customer_id: 'CUST-001', relationship_status: 'VERIFIED' },
        { id: 'm2', normalized_phone: '234567890', customer_id: 'CUST-002', relationship_status: 'VERIFIED' },
      ]), { status: 200 });
    }
    return new Response('[]', { status: 200 });
  }) as typeof fetch;
  try {
    const result = await runCustomerSelfService({
      intent: 'OUTSTANDING_INVOICES', normalizedPhone: '234567890', conversationId: '234567890',
      customerPhoneRaw: '628234567890', soNumberCandidate: null, invoiceNumberCandidate: null, watiMessageId: 'msg-2',
    });
    assert.equal(result.responseCase, 'SELF_SERVICE_ASK_CUSTOMER');
    assert.match(result.responseText ?? '', /1\.[\s\S]*\n2\./);
    assert.equal(pendingWrite!.pending_self_service_intent, 'OUTSTANDING_INVOICES');
  } finally {
    globalThis.fetch = originalFetch;
    clearEnv();
  }
});

test('Test 68/79 — with no mapping at all, no lookup is attempted and no data is disclosed', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('wati_conversation_state') && (!init?.method || init.method === 'GET')) return new Response(JSON.stringify([{ active_customer_id: null }]), { status: 200 });
    if (u.includes('customer_channel_identities')) return new Response('[]', { status: 200 });
    return new Response('[]', { status: 200 });
  }) as typeof fetch;
  try {
    const result = await runCustomerSelfService({
      intent: 'ORDER_STATUS_INQUIRY', normalizedPhone: '999999999', conversationId: '999999999',
      customerPhoneRaw: '62999999999', soNumberCandidate: null, invoiceNumberCandidate: null, watiMessageId: 'msg-3',
    });
    assert.equal(result.responseCase, 'SELF_SERVICE_NO_CUSTOMER');
    assert.equal(result.responseText, null);
  } finally {
    globalThis.fetch = originalFetch;
    clearEnv();
  }
});

test('Section 37 — resuming a pending selection with a numeric reply clears the pending state and dispatches to the chosen account', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  let activeCustomerWrite: Record<string, unknown> | null = null;
  let pendingClearWrite: Record<string, unknown> | null = null;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('wati_conversation_state') && (!init?.method || init.method === 'GET') && u.includes('pending_self_service')) {
      return new Response(JSON.stringify([{ pending_self_service_intent: 'LAST_ORDER', pending_self_service_ref: null }]), { status: 200 });
    }
    if (u.includes('wati_conversation_state') && init?.method === 'POST') {
      const body = JSON.parse(String(init.body));
      if (body.active_customer_id) activeCustomerWrite = body; else pendingClearWrite = body;
      return new Response('', { status: 201 });
    }
    if (u.includes('customer_channel_identities')) {
      return new Response(JSON.stringify([
        { id: 'm1', normalized_phone: '234567890', customer_id: 'CUST-001', relationship_status: 'VERIFIED' },
        { id: 'm2', normalized_phone: '234567890', customer_id: 'CUST-002', relationship_status: 'VERIFIED' },
      ]), { status: 200 });
    }
    return new Response('[]', { status: 200 });
  }) as typeof fetch;
  try {
    const result = await resumeSelfServiceAfterSelection({ normalizedPhone: '234567890', text: '1', conversationId: '234567890', customerPhoneRaw: '628234567890', watiMessageId: 'msg-4' });
    assert.ok(result);
    assert.equal(result?.responseCase, 'LAST_ORDER_FOUND');
    assert.equal(activeCustomerWrite!.active_customer_id, 'CUST-001');
    assert.equal(pendingClearWrite!.pending_self_service_intent, null);
  } finally {
    globalThis.fetch = originalFetch;
    clearEnv();
  }
});
