import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { isWhatsAppWebhookPayload, normalizeWhatsAppWebhook, verifyWhatsAppChallenge, verifyWhatsAppSignature } from './webhook.ts';
import { recordWhatsAppEvent } from './eventStore.ts';

const textPayload = { object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: '123' }, messages: [{ id: 'wamid.1', from: '628123', timestamp: '1700000000', type: 'text', text: { body: 'Hello VIA' } }] } }] }] };

test('accepts only a matching Meta HMAC signature', () => {
  const raw = JSON.stringify(textPayload);
  const signature = `sha256=${createHmac('sha256', 'app-secret').update(raw).digest('hex')}`;
  assert.equal(verifyWhatsAppSignature(raw, signature, 'app-secret'), true);
  assert.equal(verifyWhatsAppSignature(raw, 'sha256:wrong', 'app-secret'), false);
});
test('returns exact challenge only for matching verification token', () => {
  assert.equal(verifyWhatsAppChallenge({ mode: 'subscribe', verifyToken: 'verify-me', challenge: '12345' }, 'verify-me'), '12345');
  assert.equal(verifyWhatsAppChallenge({ mode: 'subscribe', verifyToken: 'wrong', challenge: '12345' }, 'verify-me'), null);
  assert.equal(verifyWhatsAppChallenge({ mode: null, verifyToken: null, challenge: null }, 'verify-me'), null);
});
test('normalizes messages, statuses, and unknown types safely', () => {
  const events = normalizeWhatsAppWebhook(textPayload);
  assert.deepEqual({ id: events[0].externalEventId, type: events[0].eventType, messageType: events[0].messageType, text: events[0].text }, { id: 'wamid.1', type: 'message', messageType: 'text', text: 'Hello VIA' });
  const status = normalizeWhatsAppWebhook({ object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: '123' }, statuses: [{ id: 'wamid.1', recipient_id: '628123', timestamp: '1700000001', status: 'delivered' }] } }] }] });
  assert.equal(status[0].status, 'delivered');
  const unknown = normalizeWhatsAppWebhook({ object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { messages: [{ id: 'wamid.unknown', type: 'sticker' }] } }] }] });
  assert.equal(unknown[0].messageType, 'unknown');
  assert.equal(normalizeWhatsAppWebhook({ object: 'not-whatsapp' }).length, 0);
  assert.equal(isWhatsAppWebhookPayload({ object: 'not-whatsapp' }), false);
});

test('reports duplicate records when Supabase ignores the unique event key', async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  try {
    globalThis.fetch = (async () => new Response('[]', { status: 201, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;
    const event = normalizeWhatsAppWebhook(textPayload)[0];
    assert.equal(await recordWhatsAppEvent(event), 'duplicate');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
});
