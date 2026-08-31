import assert from 'node:assert/strict';
import test from 'node:test';
import { matchRequestPhoneToIdentity } from './requestIdentityMatch.ts';

function setEnv() {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
}

test('a phone mapped to exactly one customer is KNOWN', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify([{ id: 'x', customer_id: 'c1' }]), { status: 200 })) as typeof fetch;
  try {
    assert.equal(await matchRequestPhoneToIdentity('081234567890'), 'KNOWN');
  } finally { globalThis.fetch = originalFetch; }
});

test('a phone mapped to multiple customers is MULTIPLE — never guessed', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify([{ id: 'x', customer_id: 'c1' }, { id: 'y', customer_id: 'c2' }]), { status: 200 })) as typeof fetch;
  try {
    assert.equal(await matchRequestPhoneToIdentity('081234567890'), 'MULTIPLE');
  } finally { globalThis.fetch = originalFetch; }
});

test('a phone with no mapping at all is UNKNOWN', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response('[]', { status: 200 })) as typeof fetch;
  try {
    assert.equal(await matchRequestPhoneToIdentity('081234567890'), 'UNKNOWN');
  } finally { globalThis.fetch = originalFetch; }
});

test('a missing/empty phone is UNKNOWN without ever calling the lookup', async () => {
  setEnv();
  assert.equal(await matchRequestPhoneToIdentity(null), 'UNKNOWN');
  assert.equal(await matchRequestPhoneToIdentity(''), 'UNKNOWN');
});

test('a lookup failure fails closed to UNKNOWN, never throws', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error('network down'); }) as typeof fetch;
  try {
    assert.equal(await matchRequestPhoneToIdentity('081234567890'), 'UNKNOWN');
  } finally { globalThis.fetch = originalFetch; }
});
