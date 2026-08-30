import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveConversationContext } from './context.ts';

test('Rapid messages: a bare follow-up ("stock?") carries over the prior message\'s product instead of asking again', async () => {
  const originalFetch = globalThis.fetch;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  try {
    globalThis.fetch = (async () => new Response(JSON.stringify([
      { id: 'row-1', text: 'stock?', intent: 'STOCK_CHECK', item_code: null, brand: null, product_name: null, received_at: new Date().toISOString() },
      { id: 'row-2', text: 'ATP11358M', intent: 'PRODUCT_INQUIRY', item_code: 'ATP11358M', brand: null, product_name: 'MARMO CLASSICO PRO', received_at: new Date(Date.now() - 5000).toISOString() },
    ]), { status: 200 })) as typeof fetch;

    const context = await resolveConversationContext('812345678');
    assert.equal(context.carriedProductCode, 'ATP11358M');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('No recent messages: returns no carried context rather than guessing', async () => {
  const originalFetch = globalThis.fetch;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  try {
    globalThis.fetch = (async () => new Response('[]', { status: 200 })) as typeof fetch;
    const context = await resolveConversationContext('812345678');
    assert.equal(context.carriedProductCode, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Never throws the webhook over a lookback failure — degrades to no context', async () => {
  const originalFetch = globalThis.fetch;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  try {
    globalThis.fetch = (async () => new Response('error', { status: 500 })) as typeof fetch;
    const context = await resolveConversationContext('812345678');
    assert.equal(context.carriedProductCode, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
