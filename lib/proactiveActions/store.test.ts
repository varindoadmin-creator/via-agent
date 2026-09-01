import assert from 'node:assert/strict';
import test from 'node:test';
import { upsertAction, approveAction, markSent, dismissAction } from './store.ts';
import type { ProactiveActionCandidate } from './types.ts';

function setEnv() {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
}

const BASE_CANDIDATE: ProactiveActionCandidate = {
  type: 'QUOTATION_FOLLOW_UP', customerId: 'cust-1', reason: 'Quotation idle', evidence: [{ label: 'x', value: 1 }],
  recommendedAction: 'Follow up.', channel: 'WHATSAPP', messageCategory: 'SALES_FOLLOW_UP', priority: 'NORMAL',
  dedupeKey: 'QUOTATION_FOLLOW_UP:draft-1:INITIAL_FOLLOW_UP',
};

/** A minimal in-memory stand-in for proactive_customer_actions, mirroring operationalIntelligence/findingStore.test.ts's mock shape. */
function makeMockStore() {
  let row: Record<string, unknown> | null = null;
  let idCounter = 0;

  const fetchMock = (async (url: string, init?: RequestInit) => {
    const u = String(url);
    const method = init?.method || 'GET';

    if (u.includes('/proactive_action_events')) return new Response('[]', { status: 200 });

    if (u.includes('/proactive_customer_actions') && u.includes('dedupe_key=eq.')) {
      if (method === 'GET') return new Response(JSON.stringify(row ? [row] : []), { status: 200 });
    }
    if (u.includes('/proactive_customer_actions') && method === 'POST') {
      const body = JSON.parse(String(init?.body));
      row = {
        id: `action-${++idCounter}`, organization_id: 'varindo', status: 'DETECTED', requires_approval: true,
        version: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        customer_id: null, customer_phone_normalized: null, conversation_id: null, quotation_id: null,
        sales_order_id: null, commercial_draft_id: null, sample_request_id: null, product_id: null,
        approved_by: null, approved_at: null, assigned_role: null, assigned_team: null, follow_up_stage: null,
        draft_message: null, sent_message: null, sent_at: null, responded_at: null, converted_at: null,
        potential_value: null, potential_value_label: null, dismissal_reason: null, due_at: null,
        evidence: [], ...body,
      };
      return new Response(JSON.stringify([row]), { status: 200 });
    }
    if (u.includes('/proactive_customer_actions') && method === 'PATCH') {
      if (!row) return new Response('[]', { status: 200 });
      const body = JSON.parse(String(init?.body));
      const filterVersion = /version=eq\.(\d+)/.exec(u)?.[1];
      if (filterVersion && String(row.version) !== filterVersion) return new Response('[]', { status: 200 });
      row = { ...row, ...body };
      return new Response(JSON.stringify([row]), { status: 200 });
    }
    return new Response('[]', { status: 200 });
  }) as typeof fetch;

  return { fetchMock, getRow: () => row };
}

test('Test 44 — a new candidate creates exactly one DETECTED action', async () => {
  setEnv();
  const store = makeMockStore();
  const original = globalThis.fetch;
  globalThis.fetch = store.fetchMock;
  try {
    const { action, isNew } = await upsertAction(BASE_CANDIDATE, 'REVIEW_REQUIRED', true);
    assert.equal(isNew, true);
    assert.equal(action.status, 'REVIEW_REQUIRED');
    assert.equal(action.dedupeKey, BASE_CANDIDATE.dedupeKey);
  } finally { globalThis.fetch = original; }
});

test('Test 44 — a repeat detection against an already in-flight (SENT) action is skipped, never duplicated or reset', async () => {
  setEnv();
  const store = makeMockStore();
  const original = globalThis.fetch;
  globalThis.fetch = store.fetchMock;
  try {
    const created = await upsertAction(BASE_CANDIDATE, 'DETECTED', false);
    const approved = await approveAction(created.action.id, 'director', created.action.version);
    const sent = await markSent(approved.id, approved.version, 'Follow-up sent.');
    assert.equal(sent.status, 'SENT');

    const secondPass = await upsertAction(BASE_CANDIDATE, 'DETECTED', false);
    assert.equal(secondPass.skipped, true);
    assert.equal(secondPass.action.status, 'SENT'); // never reset back to DETECTED
  } finally { globalThis.fetch = original; }
});

test('a dismissed action is left untouched by a later detection pass — a human decision is never resurrected', async () => {
  setEnv();
  const store = makeMockStore();
  const original = globalThis.fetch;
  globalThis.fetch = store.fetchMock;
  try {
    const created = await upsertAction(BASE_CANDIDATE, 'REVIEW_REQUIRED', true);
    const dismissed = await dismissAction(created.action.id, 'admin', created.action.version, 'NOT_RELEVANT');
    assert.equal(dismissed.status, 'DISMISSED');

    const secondPass = await upsertAction(BASE_CANDIDATE, 'REVIEW_REQUIRED', true);
    assert.equal(secondPass.skipped, true);
    assert.equal(secondPass.action.status, 'DISMISSED');
  } finally { globalThis.fetch = original; }
});

test('an optimistic-concurrency conflict on approve throws rather than silently double-approving', async () => {
  setEnv();
  const store = makeMockStore();
  const original = globalThis.fetch;
  globalThis.fetch = store.fetchMock;
  try {
    const created = await upsertAction(BASE_CANDIDATE, 'REVIEW_REQUIRED', true);
    await approveAction(created.action.id, 'director', created.action.version);
    await assert.rejects(() => approveAction(created.action.id, 'director', created.action.version));
  } finally { globalThis.fetch = original; }
});
