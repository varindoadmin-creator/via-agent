import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSyncableAttributes, syncCustomerToWati } from './watiContactSync.ts';
import type { ZohoContact } from '../../types/zoho.ts';

const CUSTOMER: ZohoContact = {
  contact_id: 'CUST-1', contact_name: 'PT ABC', company_name: 'PT ABC', status: 'active', contact_type: 'customer',
  cf_npwp: '012345678901000', cf_needs_faktur_pajak: true,
  outstanding_receivable_amount: 5_000_000,
  contact_persons: [{ first_name: 'Budi', last_name: 'Santoso', is_primary_contact: true }],
  salesperson_name: 'Andi',
  billing_address: { address: 'Jl. A', city: 'Jakarta', state: '', zip: '', country: 'Indonesia' },
};

test('Test 73 — synced attributes never include NPWP, credit/AR, margin, or internal notes', () => {
  const attrs = buildSyncableAttributes(CUSTOMER);
  const serialized = JSON.stringify(attrs).toLowerCase();
  assert.doesNotMatch(serialized, /npwp|012345678901000/);
  assert.doesNotMatch(serialized, /5000000|receivable|credit/);
  assert.equal(attrs.company_name, 'PT ABC');
  assert.equal(attrs.contact_person, 'Budi Santoso');
  assert.equal(attrs.zoho_customer_id, 'CUST-1');
  assert.equal(attrs.salesperson, 'Andi');
});

test('Test 73 — WATI API unavailable (unconfigured) is retryable, mapping stays valid', async () => {
  const original = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY, token: process.env.WATI_API_TOKEN, base: process.env.WATI_API_BASE_URL };
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  delete process.env.WATI_API_TOKEN;
  delete process.env.WATI_API_BASE_URL;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response('[]', { status: 201 })) as typeof fetch;
  try {
    const result = await syncCustomerToWati({ channelIdentityId: 'm1', normalizedPhone: '234567890', customer: CUSTOMER });
    assert.equal(result.status, 'SYNC_FAILED_RETRYABLE');
  } finally {
    globalThis.fetch = originalFetch;
    if (original.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = original.url;
    if (original.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = original.key;
    if (original.token !== undefined) process.env.WATI_API_TOKEN = original.token;
    if (original.base !== undefined) process.env.WATI_API_BASE_URL = original.base;
  }
});
