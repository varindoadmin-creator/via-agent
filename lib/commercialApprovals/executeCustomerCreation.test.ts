import assert from 'node:assert/strict';
import test from 'node:test';
import { approveAndCreateCustomer, customerDraftMaterialFields } from './executeCustomerCreation.ts';
import { computeDraftHash } from '../customerIdentity/approval.ts';
import type { CustomerDraft } from '../customerIdentity/customerDraft.ts';

function baseDraft(overrides: Partial<CustomerDraft> = {}): CustomerDraft {
  return {
    id: 'draft-1', organization_id: 'varindo', source: 'WATI', normalized_phone: '234567890',
    wati_contact_id: null, conversation_id: null, company_name: 'PT Baru Sekali', contact_person_name: 'Budi',
    email: null, needs_faktur_pajak: false, npwp: null,
    billing_address: { address: 'Jl. A' }, shipping_address: { address: 'Jl. A' },
    duplicate_check_status: 'NO_DUPLICATE', duplicate_candidate_customer_ids: [],
    status: 'APPROVED', created_customer_id: null, version: 1, created_at: '', updated_at: '',
    ...overrides,
  };
}

function setSupabaseEnv() {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
}

test('Test 72 — a duplicate claim on an already-executing approval no-ops instead of creating a second customer', async () => {
  setSupabaseEnv();
  const originalFetch = globalThis.fetch;
  let zohoCalled = false;
  globalThis.fetch = (async (url: string) => {
    if (String(url).includes('commercial_approvals')) return new Response('[]', { status: 200 }); // claim finds nothing — already executing
    if (String(url).includes('contacts')) { zohoCalled = true; return new Response('{}', { status: 200 }); }
    return new Response('[]', { status: 200 });
  }) as typeof fetch;
  try {
    await assert.rejects(() => approveAndCreateCustomer('approval-1'), /invalid, already used/);
    assert.equal(zohoCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Test 78 — a stale draft (edited after approval) aborts before any Zoho write', async () => {
  setSupabaseEnv();
  const originalFetch = globalThis.fetch;
  const draft = baseDraft({ version: 2 }); // current version 2, but approval below is bound to version 1
  const staleHash = computeDraftHash(customerDraftMaterialFields(baseDraft({ version: 1 })));
  let zohoCalled = false;
  globalThis.fetch = (async (url: string) => {
    const u = String(url);
    if (u.includes('commercial_approvals') && u.includes('status=eq.APPROVED')) {
      return new Response(JSON.stringify([{ id: 'approval-1', draft_type: 'CUSTOMER', draft_id: 'draft-1', draft_version: 1, draft_hash: staleHash, status: 'EXECUTING' }]), { status: 200 });
    }
    if (u.includes('customer_drafts')) return new Response(JSON.stringify([draft]), { status: 200 });
    if (u.includes('contacts')) { zohoCalled = true; return new Response('{}', { status: 200 }); }
    return new Response('[]', { status: 200 });
  }) as typeof fetch;
  try {
    await assert.rejects(() => approveAndCreateCustomer('approval-1'), /Draft changed after approval/);
    assert.equal(zohoCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
