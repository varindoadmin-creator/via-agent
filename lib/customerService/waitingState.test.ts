import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveWaitingState } from './waitingState.ts';

function withSupabaseEnv<T>(fn: () => Promise<T>): Promise<T> {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  return fn();
}

function mockTables(responses: { stock?: unknown[]; commercial?: unknown[]; customer?: unknown[] }) {
  return (async (url: string) => {
    const u = String(url);
    if (u.includes('stock_inquiries')) return new Response(JSON.stringify(responses.stock ?? []), { status: 200 });
    if (u.includes('commercial_drafts')) return new Response(JSON.stringify(responses.commercial ?? []), { status: 200 });
    if (u.includes('customer_drafts')) return new Response(JSON.stringify(responses.customer ?? []), { status: 200 });
    return new Response('[]', { status: 200 });
  }) as typeof fetch;
}

test('Test 88 — an open vendor-check stock inquiry derives WAITING_VENDOR, never a duplicate state machine', async () => {
  await withSupabaseEnv(async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockTables({ stock: [{ status: 'WAITING_FOR_VENDOR' }] });
    try {
      const result = await deriveWaitingState({ conversationId: '234567890', hasPendingSelfService: false });
      assert.equal(result, 'WAITING_VENDOR');
    } finally { globalThis.fetch = originalFetch; }
  });
});

test('Test 87 — a commercial draft needing a quantity/address from the customer derives WAITING_CUSTOMER', async () => {
  await withSupabaseEnv(async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockTables({ commercial: [{ status: 'NEEDS_DELIVERY_INFO' }] });
    try {
      const result = await deriveWaitingState({ conversationId: '234567890', hasPendingSelfService: false });
      assert.equal(result, 'WAITING_CUSTOMER');
    } finally { globalThis.fetch = originalFetch; }
  });
});

test('a commercial draft ready for internal review derives WAITING_INTERNAL', async () => {
  await withSupabaseEnv(async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockTables({ commercial: [{ status: 'WAITING_FOR_APPROVAL' }] });
    try {
      const result = await deriveWaitingState({ conversationId: '234567890', hasPendingSelfService: false });
      assert.equal(result, 'WAITING_INTERNAL');
    } finally { globalThis.fetch = originalFetch; }
  });
});

test('vendor takes priority over an internal-review signal when both exist', async () => {
  await withSupabaseEnv(async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockTables({ stock: [{ status: 'VENDOR_CLOSED' }], commercial: [{ status: 'WAITING_FOR_APPROVAL' }] });
    try {
      const result = await deriveWaitingState({ conversationId: '234567890', hasPendingSelfService: false });
      assert.equal(result, 'WAITING_VENDOR');
    } finally { globalThis.fetch = originalFetch; }
  });
});

test('no open workflow signal at all resolves to null, not a guessed state', async () => {
  await withSupabaseEnv(async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockTables({});
    try {
      const result = await deriveWaitingState({ conversationId: '234567890', hasPendingSelfService: false });
      assert.equal(result, null);
    } finally { globalThis.fetch = originalFetch; }
  });
});
