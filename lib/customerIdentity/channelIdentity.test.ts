import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveCustomerIdentities, createChannelIdentity, disableChannelIdentity } from './channelIdentity.ts';

function withSupabaseEnv<T>(fn: () => Promise<T>): Promise<T> {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  return fn();
}

test('Test 70a — one phone -> one customer resolves to ONE, auto-selectable', async () => {
  await withSupabaseEnv(async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify([
      { id: 'm1', normalized_phone: '234567890', customer_id: 'CUST-1', relationship_status: 'VERIFIED' },
    ]), { status: 200 })) as typeof fetch;
    try {
      const result = await resolveCustomerIdentities('234567890');
      assert.equal(result.status, 'ONE');
      if (result.status === 'ONE') assert.equal(result.mapping.customer_id, 'CUST-1');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test('Test 70b — one phone -> multiple customers resolves to MANY, never auto-picks', async () => {
  await withSupabaseEnv(async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify([
      { id: 'm1', normalized_phone: '234567890', customer_id: 'CUST-1', relationship_status: 'VERIFIED' },
      { id: 'm2', normalized_phone: '234567890', customer_id: 'CUST-2', relationship_status: 'UNVERIFIED' },
    ]), { status: 200 })) as typeof fetch;
    try {
      const result = await resolveCustomerIdentities('234567890');
      assert.equal(result.status, 'MANY');
      if (result.status === 'MANY') assert.equal(result.mappings.length, 2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test('Test 70d — unknown phone with no rows resolves to NONE', async () => {
  await withSupabaseEnv(async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response('[]', { status: 200 })) as typeof fetch;
    try {
      const result = await resolveCustomerIdentities('999999999');
      assert.equal(result.status, 'NONE');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test('a disabled mapping is excluded from resolution query filters', async () => {
  await withSupabaseEnv(async () => {
    const originalFetch = globalThis.fetch;
    let capturedQuery = '';
    globalThis.fetch = (async (url: string) => {
      capturedQuery = String(url);
      return new Response('[]', { status: 200 });
    }) as typeof fetch;
    try {
      await resolveCustomerIdentities('234567890');
      assert.match(capturedQuery, /relationship_status=neq\.DISABLED/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test('createChannelIdentity marks source and defaults to UNVERIFIED', async () => {
  await withSupabaseEnv(async () => {
    const originalFetch = globalThis.fetch;
    let capturedBody: Record<string, unknown> | null = null;
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify([{ id: 'm3', ...capturedBody }]), { status: 201 });
    }) as typeof fetch;
    try {
      const mapping = await createChannelIdentity({ normalizedPhone: '234567890', customerId: 'CUST-3', source: 'ONBOARDING_CREATED' });
      assert.equal(mapping.customer_id, 'CUST-3');
      assert.equal(capturedBody!.relationship_status, 'UNVERIFIED');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test('disableChannelIdentity issues a status-only PATCH, never deletes the audit row', async () => {
  await withSupabaseEnv(async () => {
    const originalFetch = globalThis.fetch;
    let capturedMethod = '';
    let capturedBody: Record<string, unknown> | null = null;
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      capturedMethod = init?.method || '';
      capturedBody = JSON.parse(String(init?.body));
      return new Response('[]', { status: 200 });
    }) as typeof fetch;
    try {
      await disableChannelIdentity('m1', 'admin-1');
      assert.equal(capturedMethod, 'PATCH');
      assert.equal(capturedBody!.relationship_status, 'DISABLED');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
