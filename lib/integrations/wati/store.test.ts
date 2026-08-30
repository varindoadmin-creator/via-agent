import assert from 'node:assert/strict';
import test from 'node:test';
import { reserveWatiMessage } from './store.ts';
import { normalizeWatiMessage } from './message.ts';

test('Duplicate webhook: a second reservation with the same provider_message_id is reported as duplicate, not reprocessed', async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  try {
    const message = normalizeWatiMessage({ id: 'wati-msg-1', waId: '628123', text: 'Halo', type: 'text' });

    globalThis.fetch = (async () => new Response(JSON.stringify([{ id: 'row-1' }]), { status: 201 })) as typeof fetch;
    const first = await reserveWatiMessage(message);
    assert.equal(first.outcome, 'recorded');

    // Supabase's resolution=ignore-duplicates returns an empty array when the
    // unique key already exists — exactly like lib/whatsapp/eventStore.ts's
    // duplicate case.
    globalThis.fetch = (async () => new Response('[]', { status: 201 })) as typeof fetch;
    const second = await reserveWatiMessage(message);
    assert.equal(second.outcome, 'duplicate');
    assert.equal(second.id, null);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
});

test('customer_phone_normalized is derived from the WhatsApp number for later context lookback', async () => {
  const originalFetch = globalThis.fetch;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  let capturedBody: Record<string, unknown> | null = null;
  try {
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify([{ id: 'row-2' }]), { status: 201 });
    }) as typeof fetch;
    const message = normalizeWatiMessage({ id: 'wati-msg-2', waId: '+62 812-3456-7890', text: 'Halo', type: 'text' });
    const result = await reserveWatiMessage(message);
    assert.equal(result.outcome, 'recorded');
    // Last 9 digits of 6281234567890 — absorbs the +62 country code.
    assert.equal(result.customerPhoneNormalized, '234567890');
    assert.equal(capturedBody!.customer_phone_normalized, '234567890');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
