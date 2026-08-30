import assert from 'node:assert/strict';
import test from 'node:test';
import { approveAndCreateCommercialDraft } from './executeCommercialDraft.ts';

function setSupabaseEnv() {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
}

test('Test 78 — a duplicate execution attempt on an already-claimed approval no-ops instead of creating a second Sales Order', async () => {
  setSupabaseEnv();
  const originalFetch = globalThis.fetch;
  let zohoCalled = false;
  globalThis.fetch = (async (url: string) => {
    const u = String(url);
    if (u.includes('commercial_approvals') && u.includes('status=eq.APPROVED')) return new Response('[]', { status: 200 }); // already executing/claimed
    if (u.includes('salesorders') || u.includes('estimates')) { zohoCalled = true; return new Response('{}', { status: 200 }); }
    return new Response('[]', { status: 200 });
  }) as typeof fetch;
  try {
    await assert.rejects(() => approveAndCreateCommercialDraft('approval-1'), /invalid, already used/);
    assert.equal(zohoCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('a stale draft (edited after approval) aborts before any Zoho write', async () => {
  setSupabaseEnv();
  const originalFetch = globalThis.fetch;
  const draft = {
    id: 'draft-1', organization_id: 'varindo', type: 'SALES_ORDER', source: 'WATI', conversation_id: '234567890',
    customer_id: 'CUST-1', customer_draft_id: null, delivery_address_id: 'A1', proposed_delivery_address: null,
    pending_product_id: null, pending_item_code: null, pending_product_name: null, pending_quantity: null, pending_unit: null, pending_brand: null, pending_source_message_id: null,
    status: 'APPROVED', currency: 'IDR', subtotal: 100, tax: 0, total: 100, salesperson_id: null, payment_terms_id: null,
    source_message_ids: [], zoho_object_type: null, zoho_object_id: null, zoho_object_number: null,
    version: 5, created_at: '', updated_at: '',
  };
  let zohoCalled = false;
  globalThis.fetch = (async (url: string) => {
    const u = String(url);
    if (u.includes('commercial_approvals') && u.includes('status=eq.APPROVED')) {
      return new Response(JSON.stringify([{ id: 'approval-1', draft_type: 'COMMERCIAL', draft_id: 'draft-1', draft_version: 1, draft_hash: 'stale-hash', status: 'EXECUTING' }]), { status: 200 });
    }
    if (u.includes('commercial_drafts')) return new Response(JSON.stringify([draft]), { status: 200 });
    if (u.includes('commercial_draft_lines')) return new Response('[]', { status: 200 });
    if (u.includes('salesorders') || u.includes('estimates')) { zohoCalled = true; return new Response('{}', { status: 200 }); }
    return new Response('[]', { status: 200 });
  }) as typeof fetch;
  try {
    await assert.rejects(() => approveAndCreateCommercialDraft('approval-1'), /Draft changed after approval/);
    assert.equal(zohoCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
