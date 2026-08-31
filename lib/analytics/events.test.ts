import assert from 'node:assert/strict';
import test from 'node:test';
import { recordAnalyticsEvent } from './events.ts';

function setEnv() {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
}

test('Test 92 — a duplicate source ID for the same event type never double-counts (idempotency key + ignore-duplicates)', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  let capturedDedupeKey = '';
  let capturedConflictParam = '';
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    capturedConflictParam = String(url);
    const body = JSON.parse(String(init?.body));
    capturedDedupeKey = body.dedupe_key;
    return new Response('', { status: 201 });
  }) as typeof fetch;
  try {
    await recordAnalyticsEvent({ eventType: 'stock.inquiry', sourceId: 'inquiry-123' });
    assert.equal(capturedDedupeKey, 'stock.inquiry:inquiry-123');
    assert.match(capturedConflictParam, /on_conflict=dedupe_key/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('a recording failure never throws — analytics must never break the operational flow it observes', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response('server error', { status: 500 })) as typeof fetch;
  try {
    await assert.doesNotReject(() => recordAnalyticsEvent({ eventType: 'order.created', sourceId: 'draft-1' }));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('event time uses the caller-supplied occurredAt, not just recording time (brief section 6)', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  let capturedBody: Record<string, unknown> | null = null;
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    capturedBody = JSON.parse(String(init?.body));
    return new Response('', { status: 201 });
  }) as typeof fetch;
  try {
    const occurredAt = new Date('2026-01-01T00:00:00.000Z');
    await recordAnalyticsEvent({ eventType: 'lead.created', sourceId: 'lead-1', occurredAt });
    assert.equal(capturedBody!.occurred_at, occurredAt.toISOString());
  } finally {
    globalThis.fetch = originalFetch;
  }
});
