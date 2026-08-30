import assert from 'node:assert/strict';
import test from 'node:test';
import { getActiveCustomerId, setActiveCustomerId } from './conversationState.ts';

function withSupabaseEnv<T>(fn: () => Promise<T>): Promise<T> {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  return fn();
}

test('Section 4 — getActiveCustomerId returns null when nothing is set yet', async () => {
  await withSupabaseEnv(async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify([{ active_customer_id: null }]), { status: 200 })) as typeof fetch;
    try {
      const result = await getActiveCustomerId('234567890');
      assert.equal(result, null);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test('Section 4 — getActiveCustomerId reuses a previously selected account across turns', async () => {
  await withSupabaseEnv(async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify([{ active_customer_id: 'CUST-001' }]), { status: 200 })) as typeof fetch;
    try {
      const result = await getActiveCustomerId('234567890');
      assert.equal(result, 'CUST-001');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test('Section 37 — setActiveCustomerId upserts by phone with a fresh selected_at timestamp', async () => {
  await withSupabaseEnv(async () => {
    const originalFetch = globalThis.fetch;
    let capturedBody: Record<string, unknown> | null = null;
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body));
      return new Response('', { status: 201 });
    }) as typeof fetch;
    try {
      await setActiveCustomerId('234567890', 'CUST-002');
      assert.equal(capturedBody!.active_customer_id, 'CUST-002');
      assert.ok(capturedBody!.active_customer_selected_at);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
