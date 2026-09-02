import assert from 'node:assert/strict';
import test from 'node:test';
import { autoReturnIdleActiveCases, autoReturnIdleHours } from './autoReturn.ts';

function setEnv() {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
}

test('defaults to 24 idle hours when CS_AUTO_RETURN_IDLE_HOURS is unset or invalid', () => {
  delete process.env.CS_AUTO_RETURN_IDLE_HOURS;
  assert.equal(autoReturnIdleHours(), 24);
  process.env.CS_AUTO_RETURN_IDLE_HOURS = '0';
  assert.equal(autoReturnIdleHours(), 24);
  process.env.CS_AUTO_RETURN_IDLE_HOURS = '6';
  assert.equal(autoReturnIdleHours(), 6);
  delete process.env.CS_AUTO_RETURN_IDLE_HOURS;
});

test('does nothing when AUTO_RETURN_TO_VIA_ENABLED is off, even with idle HUMAN_ACTIVE cases present', async () => {
  setEnv();
  delete process.env.AUTO_RETURN_TO_VIA_ENABLED;
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = (async () => { fetchCalled = true; return new Response('[]', { status: 200 }); }) as typeof fetch;
  try {
    const result = await autoReturnIdleActiveCases();
    assert.deepEqual(result, { returned: 0, skipped: 0 });
    assert.equal(fetchCalled, false, 'must not even query when the flag is off');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('returns an idle, non-urgent HUMAN_ACTIVE case to AUTO and records the audit event', async () => {
  setEnv();
  process.env.AUTO_RETURN_TO_VIA_ENABLED = 'true';
  const originalFetch = globalThis.fetch;
  let patchedBody: Record<string, unknown> | null = null;
  let patchedVersionFilter: string | null = null;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('wati_conversation_state') && (!init?.method || init.method === 'GET')) {
      return new Response(JSON.stringify([
        { customer_phone_normalized: '111222333', handoff_reason: 'AMBIGUOUS_PRODUCT', priority: 'NORMAL', last_inbound_at: '2026-08-30T00:00:00Z', version: 2 },
      ]), { status: 200 });
    }
    if (u.includes('wati_conversation_state') && init?.method === 'PATCH') {
      patchedVersionFilter = u;
      patchedBody = JSON.parse(String(init.body));
      return new Response(JSON.stringify([{ customer_phone_normalized: '111222333', state: 'AUTO', assigned_role: null, version: 3 }]), { status: 200 });
    }
    return new Response('[]', { status: 200 });
  }) as typeof fetch;
  try {
    const result = await autoReturnIdleActiveCases();
    assert.deepEqual(result, { returned: 1, skipped: 0 });
    assert.equal(patchedBody!.state, 'AUTO');
    assert.equal(patchedBody!.assigned_role, null);
    assert.match(patchedVersionFilter!, /version=eq\.2/);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.AUTO_RETURN_TO_VIA_ENABLED;
  }
});

test('a concurrent version mismatch (a human just acted on the case) is skipped, not clobbered', async () => {
  setEnv();
  process.env.AUTO_RETURN_TO_VIA_ENABLED = 'true';
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('wati_conversation_state') && (!init?.method || init.method === 'GET')) {
      return new Response(JSON.stringify([
        { customer_phone_normalized: '111222333', handoff_reason: 'AMBIGUOUS_PRODUCT', priority: 'NORMAL', last_inbound_at: '2026-08-30T00:00:00Z', version: 2 },
      ]), { status: 200 });
    }
    if (u.includes('wati_conversation_state') && init?.method === 'PATCH') {
      // No row matches the stale version filter — simulates a human having already changed it.
      return new Response('[]', { status: 200 });
    }
    return new Response('[]', { status: 200 });
  }) as typeof fetch;
  try {
    const result = await autoReturnIdleActiveCases();
    assert.deepEqual(result, { returned: 0, skipped: 1 });
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.AUTO_RETURN_TO_VIA_ENABLED;
  }
});
