import assert from 'node:assert/strict';
import test from 'node:test';
import { upsertFinding, recordNormalPass, dismissFinding, type FindingWriteInput } from './findingStore.ts';

function setEnv() {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
}

const BASE_INPUT: FindingWriteInput = {
  category: 'CUSTOMER_SERVICE', type: 'CUSTOMER_SERVICE_SLA_DETERIORATION', title: 'SLA is deteriorating',
  dedupeKey: 'CUSTOMER_SERVICE_SLA_DETERIORATION', severity: 'HIGH', urgency: 'HIGH', confidence: 'HIGH',
  evidence: [{ metricKey: 'sla_compliance', label: 'SLA compliance', currentValue: 0.8 }], ruleVersion: 1,
};

/** A minimal in-memory stand-in for operational_findings, keyed by dedupe_key, driven purely by URL/method inspection. */
function makeMockStore() {
  let row: Record<string, unknown> | null = null;
  let idCounter = 0;

  const fetchMock = (async (url: string, init?: RequestInit) => {
    const u = String(url);
    const method = init?.method || 'GET';

    if (u.includes('/operational_finding_events')) return new Response('[]', { status: 200 });

    if (u.includes('dedupe_key=eq.')) {
      if (method === 'GET') return new Response(JSON.stringify(row ? [row] : []), { status: 200 });
    }
    if (method === 'POST') {
      const body = JSON.parse(String(init?.body));
      row = { id: `finding-${++idCounter}`, organization_id: 'varindo', status: 'OPEN', consecutive_breach_count: 1, consecutive_normal_count: 0, recurrence_count: 0, dismissal_reason: null, last_alerted_at: null, version: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), metric_key: null, entity_type: null, entity_id: null, period_start: null, period_end: null, current_value: null, baseline_value: null, baseline_type: null, absolute_change: null, percent_change: null, resolved_value: null, recommended_action_type: null, recommendation_text: null, assigned_role: null, assigned_team: null, due_at: null, evidence: [], ...body };
      return new Response(JSON.stringify([row]), { status: 200 });
    }
    if (method === 'PATCH') {
      if (!row) return new Response('[]', { status: 200 });
      const body = JSON.parse(String(init?.body));
      const filterVersion = /version=eq\.(\d+)/.exec(u)?.[1];
      if (filterVersion && String(row.version) !== filterVersion) return new Response('[]', { status: 200 }); // optimistic-concurrency mismatch
      row = { ...row, ...body };
      return new Response(JSON.stringify([row]), { status: 200 });
    }
    return new Response('[]', { status: 200 });
  }) as typeof fetch;

  return { fetchMock, getRow: () => row };
}

test('Test 123 — a new breaching condition creates exactly one OPEN finding', async () => {
  setEnv();
  const store = makeMockStore();
  const original = globalThis.fetch;
  globalThis.fetch = store.fetchMock;
  try {
    const { finding, isNew } = await upsertFinding(BASE_INPUT);
    assert.equal(isNew, true);
    assert.equal(finding.status, 'OPEN');
    assert.equal(finding.consecutiveBreachCount, 1);
  } finally { globalThis.fetch = original; }
});

test('Test 123 — a duplicate scheduled run updates the existing finding in place, never creating a second row', async () => {
  setEnv();
  const store = makeMockStore();
  const original = globalThis.fetch;
  globalThis.fetch = store.fetchMock;
  try {
    const first = await upsertFinding(BASE_INPUT);
    const second = await upsertFinding({ ...BASE_INPUT, currentValue: 0.75 });
    assert.equal(second.isNew, false);
    assert.equal(second.finding.id, first.finding.id);
    assert.equal(second.finding.consecutiveBreachCount, 2);
  } finally { globalThis.fetch = original; }
});

test('Test 135 — a resolved finding that breaches again reopens as a tracked recurrence, not a duplicate', async () => {
  setEnv();
  const store = makeMockStore();
  const original = globalThis.fetch;
  globalThis.fetch = store.fetchMock;
  try {
    await upsertFinding(BASE_INPUT);
    // Simulate a prior resolution (the transition functions themselves are exercised in their own test below).
    const row = store.getRow();
    if (row) row.status = 'RESOLVED';

    const recurrence = await upsertFinding(BASE_INPUT);
    assert.equal(recurrence.isRecurrence, true);
    assert.equal(recurrence.finding.status, 'OPEN');
    assert.equal(recurrence.finding.recurrenceCount, 1);
  } finally { globalThis.fetch = original; }
});

test('Test 134 — auto-resolution requires the configured number of consecutive normal passes, not just one', async () => {
  setEnv();
  const store = makeMockStore();
  const original = globalThis.fetch;
  globalThis.fetch = store.fetchMock;
  try {
    await upsertFinding(BASE_INPUT);
    const afterOne = await recordNormalPass(BASE_INPUT.dedupeKey, 0.95, true, 2);
    assert.equal(afterOne?.status, 'OPEN');
    const afterTwo = await recordNormalPass(BASE_INPUT.dedupeKey, 0.95, true, 2);
    assert.equal(afterTwo?.status, 'RESOLVED');
    assert.equal(afterTwo?.resolvedValue, 0.95);
  } finally { globalThis.fetch = original; }
});

test('Test 140 — dismissing a finding transitions its status and records the reason (audited via recordFindingEvent)', async () => {
  setEnv();
  const store = makeMockStore();
  const original = globalThis.fetch;
  globalThis.fetch = store.fetchMock;
  try {
    const { finding } = await upsertFinding(BASE_INPUT);
    const dismissed = await dismissFinding(finding.id, 'director', finding.version, 'NOT_MATERIAL');
    assert.equal(dismissed.status, 'DISMISSED');
    assert.equal(dismissed.dismissalReason, 'NOT_MATERIAL');
  } finally { globalThis.fetch = original; }
});

test('auto-resolution never fires when AUTO_FINDING_RESOLUTION_ENABLED-equivalent flag is off, even after many normal passes', async () => {
  setEnv();
  const store = makeMockStore();
  const original = globalThis.fetch;
  globalThis.fetch = store.fetchMock;
  try {
    await upsertFinding(BASE_INPUT);
    await recordNormalPass(BASE_INPUT.dedupeKey, 0.95, false, 2);
    const result = await recordNormalPass(BASE_INPUT.dedupeKey, 0.95, false, 2);
    assert.equal(result?.status, 'OPEN');
  } finally { globalThis.fetch = original; }
});
