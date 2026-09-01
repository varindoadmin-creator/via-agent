import assert from 'node:assert/strict';
import test from 'node:test';
import { isNowHumanOwned } from './pipeline.ts';

function setEnv() {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
}

function mockFetchWithState(state: string | null): typeof fetch {
  return (async () => new Response(JSON.stringify(state ? [{ state }] : []), { status: 200 })) as typeof fetch;
}

// Phase 13, brief sections 24, 56: before an automatic outbound send, the
// pipeline re-checks whether a human has taken over since the response was
// decided. This is the exact predicate that recheck uses.
test('Test 56 — NEEDS_HUMAN, HUMAN_ASSIGNED, and HUMAN_ACTIVE are all treated as human-owned for the race recheck', async () => {
  setEnv();
  const original = globalThis.fetch;
  try {
    for (const state of ['NEEDS_HUMAN', 'HUMAN_ASSIGNED', 'HUMAN_ACTIVE']) {
      globalThis.fetch = mockFetchWithState(state);
      assert.equal(await isNowHumanOwned('628123'), true, `expected ${state} to be human-owned`);
    }
  } finally { globalThis.fetch = original; }
});

test('AUTO, RESOLVED, and CLOSED are not human-owned — automatic outbound remains eligible', async () => {
  setEnv();
  const original = globalThis.fetch;
  try {
    for (const state of ['AUTO', 'RESOLVED', 'CLOSED']) {
      globalThis.fetch = mockFetchWithState(state);
      assert.equal(await isNowHumanOwned('628123'), false, `expected ${state} to NOT be human-owned`);
    }
  } finally { globalThis.fetch = original; }
});

test('no service case row at all is not human-owned (never blocks a first-time send)', async () => {
  setEnv();
  const original = globalThis.fetch;
  globalThis.fetch = mockFetchWithState(null);
  try {
    assert.equal(await isNowHumanOwned('628123'), false);
  } finally { globalThis.fetch = original; }
});
