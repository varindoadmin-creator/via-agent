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

test('2026-09-02: a message just past the old 10-minute window is still carried under the new default (30 min)', async () => {
  const originalFetch = globalThis.fetch;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  delete process.env.WATI_CONTEXT_LOOKBACK_MINUTES;
  try {
    let capturedSince: string | null = null;
    globalThis.fetch = (async (url: string) => {
      capturedSince = new URL(String(url)).searchParams.get('received_at');
      // 13m40s old — the real live-WABA gap that lost context under the old 10-minute window.
      return new Response(JSON.stringify([
        { id: 'row-1', text: 'Apakah ada edging untuk DXO 5338D?', intent: 'EDGE_BAND_INQUIRY', item_code: 'LAM-EAP5338R0V2/23', brand: 'LAMITAK', product_name: 'x', received_at: new Date(Date.now() - 13 * 60_000 - 40_000).toISOString() },
      ]), { status: 200 });
    }) as typeof fetch;

    const context = await resolveConversationContext('812345678');
    assert.equal(context.carriedProductCode, 'LAM-EAP5338R0V2/23');
    // gte.<cutoff> — cutoff should be ~30 minutes ago, not ~10.
    const cutoff = new Date(decodeURIComponent(capturedSince!.replace('gte.', '')));
    const minutesAgo = (Date.now() - cutoff.getTime()) / 60_000;
    assert.ok(minutesAgo > 20, `expected the lookback window to be well past 10 minutes, was ~${minutesAgo.toFixed(1)}m`);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('WATI_CONTEXT_LOOKBACK_MINUTES overrides the default', async () => {
  const originalFetch = globalThis.fetch;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  process.env.WATI_CONTEXT_LOOKBACK_MINUTES = '5';
  try {
    let capturedSince: string | null = null;
    globalThis.fetch = (async (url: string) => {
      capturedSince = new URL(String(url)).searchParams.get('received_at');
      return new Response('[]', { status: 200 });
    }) as typeof fetch;

    await resolveConversationContext('812345678');
    const cutoff = new Date(decodeURIComponent(capturedSince!.replace('gte.', '')));
    const minutesAgo = (Date.now() - cutoff.getTime()) / 60_000;
    assert.ok(minutesAgo < 6 && minutesAgo > 4, `expected ~5 minutes, was ~${minutesAgo.toFixed(1)}m`);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.WATI_CONTEXT_LOOKBACK_MINUTES;
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
