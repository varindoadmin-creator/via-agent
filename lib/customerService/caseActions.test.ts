import assert from 'node:assert/strict';
import test from 'node:test';
import { takeOver, returnToAuto, resolveCase, reopenCase } from './caseActions.ts';

function setEnv() {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
}

function existingCase(overrides: Record<string, unknown> = {}) {
  return {
    customer_phone_normalized: '234567890', state: 'NEEDS_HUMAN', priority: 'NORMAL',
    assigned_role: null, assigned_team: 'CUSTOMER_SERVICE', handoff_reason: 'CUSTOMER_REQUESTED_HUMAN',
    handoff_created_at: '2026-01-01T00:00:00.000Z', human_assigned_at: null, human_first_response_at: null,
    resolved_at: null, closed_at: null, active_customer_id: null, version: 3,
    ...overrides,
  };
}

test('Test 81 — Admin takeover sets HUMAN_ACTIVE and assigns the actor role, using the correct version for the concurrency check', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  let patchQuery = '';
  let patchBody: Record<string, unknown> | null = null;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (!init?.method || init.method === 'GET') return new Response(JSON.stringify([existingCase()]), { status: 200 });
    if (!u.includes('wati_conversation_state')) return new Response('', { status: 201 });
    patchQuery = u;
    patchBody = JSON.parse(String(init.body));
    return new Response(JSON.stringify([{ ...existingCase(), ...patchBody }]), { status: 200 });
  }) as typeof fetch;
  try {
    const result = await takeOver('234567890', 'admin');
    assert.equal(result.state, 'HUMAN_ACTIVE');
    assert.match(patchQuery, /version=eq\.3/);
    assert.equal(patchBody!.assigned_role, 'admin');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Test 82 — Return to VIA sets AUTO and clears the assigned role, preserving everything else', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  let patchBody: Record<string, unknown> | null = null;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    if (!init?.method || init.method === 'GET') return new Response(JSON.stringify([existingCase({ state: 'HUMAN_ACTIVE', assigned_role: 'admin' })]), { status: 200 });
    if (!String(url).includes('wati_conversation_state')) return new Response('', { status: 201 });
    patchBody = JSON.parse(String(init.body));
    return new Response(JSON.stringify([{ ...existingCase(), ...patchBody }]), { status: 200 });
  }) as typeof fetch;
  try {
    const result = await returnToAuto('234567890', 'admin');
    assert.equal(result.state, 'AUTO');
    assert.equal(patchBody!.assigned_role, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('a concurrent version mismatch throws rather than silently overwriting a newer human action', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    if (!init?.method || init.method === 'GET') return new Response(JSON.stringify([existingCase()]), { status: 200 });
    return new Response('[]', { status: 200 }); // version filter matched nothing -- someone else updated first
  }) as typeof fetch;
  try {
    await assert.rejects(() => takeOver('234567890', 'admin'), /modified concurrently/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('resolveCase sets RESOLVED with a resolved_at timestamp', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  let patchBody: Record<string, unknown> | null = null;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    if (!init?.method || init.method === 'GET') return new Response(JSON.stringify([existingCase({ state: 'HUMAN_ACTIVE' })]), { status: 200 });
    if (!String(url).includes('wati_conversation_state')) return new Response('', { status: 201 });
    patchBody = JSON.parse(String(init.body));
    return new Response(JSON.stringify([{ ...existingCase(), ...patchBody }]), { status: 200 });
  }) as typeof fetch;
  try {
    const result = await resolveCase('234567890', 'director');
    assert.equal(result.state, 'RESOLVED');
    assert.ok(patchBody!.resolved_at);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('reopenCase restarts the SLA clock with a fresh handoff_created_at', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  let patchBody: Record<string, unknown> | null = null;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    if (!init?.method || init.method === 'GET') return new Response(JSON.stringify([existingCase({ state: 'RESOLVED', resolved_at: '2026-01-01T01:00:00.000Z' })]), { status: 200 });
    if (!String(url).includes('wati_conversation_state')) return new Response('', { status: 201 });
    patchBody = JSON.parse(String(init.body));
    return new Response(JSON.stringify([{ ...existingCase(), ...patchBody }]), { status: 200 });
  }) as typeof fetch;
  try {
    const result = await reopenCase('234567890', 'admin');
    assert.equal(result.state, 'NEEDS_HUMAN');
    assert.equal(patchBody!.resolved_at, null);
    assert.notEqual(patchBody!.handoff_created_at, '2026-01-01T00:00:00.000Z');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
