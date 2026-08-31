import assert from 'node:assert/strict';
import test from 'node:test';
import { runOperationalDetection } from './detectionEngine.ts';

function setEnv() {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  delete process.env.MANAGEMENT_ALERTS_ENABLED; // never touch sendMail in these tests
}

/** Every "frequent" rule's own queries default to empty/quiet; the backlog
 * query can be forced to breach via `backlogRows`. `operational_findings`
 * itself is a minimal stateful store, mirroring findingStore.test.ts. */
function makeFetchMock(backlogRows: unknown[] = []) {
  const findings = new Map<string, Record<string, unknown>>();
  let idCounter = 0;
  let writeCount = 0;

  const fetchMock = (async (url: string, init?: RequestInit) => {
    const u = String(url);
    const method = init?.method || 'GET';

    if (u.includes('/operational_finding_events')) return new Response('[]', { status: 200 });

    if (u.includes('/operational_findings')) {
      if (method === 'GET' && u.includes('dedupe_key=eq.')) {
        const key = decodeURIComponent(/dedupe_key=eq\.([^&]+)/.exec(u)?.[1] ?? '');
        const row = findings.get(key);
        return new Response(JSON.stringify(row ? [row] : []), { status: 200 });
      }
      if (method === 'POST') {
        writeCount++;
        const body = JSON.parse(String(init?.body));
        const row = { id: `f${++idCounter}`, status: 'OPEN', consecutive_breach_count: 1, consecutive_normal_count: 0, recurrence_count: 0, last_alerted_at: null, dismissal_reason: null, version: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), evidence: [], ...body };
        findings.set(String(body.dedupe_key), row);
        return new Response(JSON.stringify([row]), { status: 200 });
      }
      if (method === 'PATCH') {
        writeCount++;
        const dedupeMatch = /dedupe_key=eq\.([^&]+)/.exec(u);
        const idMatch = /[?&]id=eq\.([^&]+)/.exec(u);
        const body = JSON.parse(String(init?.body));
        let key: string | undefined;
        if (dedupeMatch) key = decodeURIComponent(dedupeMatch[1]);
        else if (idMatch) key = Array.from(findings.entries()).find(([, r]) => r.id === idMatch[1])?.[0];
        if (!key) return new Response('[]', { status: 200 });
        const existing = findings.get(key);
        if (!existing) return new Response('[]', { status: 200 });
        const updated = { ...existing, ...body };
        findings.set(key, updated);
        return new Response(JSON.stringify([updated]), { status: 200 });
      }
    }

    if (u.includes('wati_conversation_state') && u.includes('NEEDS_HUMAN,HUMAN_ASSIGNED,HUMAN_ACTIVE')) {
      return new Response(JSON.stringify(backlogRows), { status: 200 });
    }

    return new Response('[]', { status: 200 }); // every other rule's query defaults to quiet
  }) as typeof fetch;

  return { fetchMock, getWriteCount: () => writeCount, getFindings: () => findings };
}

test('a quiet system produces zero findings and zero writes', async () => {
  setEnv();
  const { fetchMock, getWriteCount } = makeFetchMock([]);
  const original = globalThis.fetch;
  globalThis.fetch = fetchMock;
  try {
    const result = await runOperationalDetection({ dryRun: false, notify: false, includeDailyRules: false });
    assert.equal(result.newFindings, 0);
    assert.equal(getWriteCount(), 0);
  } finally { globalThis.fetch = original; }
});

test('Test 141 — dryRun computes candidates without writing anything to operational_findings', async () => {
  setEnv();
  const oldHandoff = new Date(Date.now() - 39 * 60_000).toISOString();
  const backlogRows = Array.from({ length: 60 }, (_, i) => ({ customer_phone_normalized: `u${i}`, assigned_role: null, handoff_created_at: oldHandoff }));
  const { fetchMock, getWriteCount } = makeFetchMock(backlogRows);
  const original = globalThis.fetch;
  globalThis.fetch = fetchMock;
  try {
    const result = await runOperationalDetection({ dryRun: true, notify: false, includeDailyRules: false });
    assert.ok(result.candidates.some(c => c.type === 'CUSTOMER_SERVICE_BACKLOG_RISK'));
    assert.equal(getWriteCount(), 0, 'dry-run must never persist a finding');
  } finally { globalThis.fetch = original; }
});

test('a breaching condition persists exactly one finding, and a duplicate scheduled run updates it in place rather than duplicating', async () => {
  setEnv();
  const oldHandoff = new Date(Date.now() - 39 * 60_000).toISOString();
  const backlogRows = Array.from({ length: 60 }, (_, i) => ({ customer_phone_normalized: `u${i}`, assigned_role: null, handoff_created_at: oldHandoff }));
  const { fetchMock, getFindings } = makeFetchMock(backlogRows);
  const original = globalThis.fetch;
  globalThis.fetch = fetchMock;
  try {
    const first = await runOperationalDetection({ dryRun: false, notify: false, includeDailyRules: false });
    assert.equal(first.newFindings, 1);
    const second = await runOperationalDetection({ dryRun: false, notify: false, includeDailyRules: false });
    assert.equal(second.updatedFindings, 1);
    assert.equal(second.newFindings, 0);
    assert.equal(getFindings().size, 1, 'exactly one durable row, never a duplicate');
  } finally { globalThis.fetch = original; }
});

test('Test 139 — alerts never fire when MANAGEMENT_ALERTS_ENABLED is off, regardless of severity', async () => {
  setEnv();
  const oldHandoff = new Date(Date.now() - 39 * 60_000).toISOString();
  const backlogRows = Array.from({ length: 60 }, (_, i) => ({ customer_phone_normalized: `u${i}`, assigned_role: null, handoff_created_at: oldHandoff }));
  const { fetchMock } = makeFetchMock(backlogRows);
  const original = globalThis.fetch;
  globalThis.fetch = fetchMock;
  try {
    const result = await runOperationalDetection({ dryRun: false, notify: true, includeDailyRules: false });
    assert.equal(result.alertsSent, 0);
  } finally { globalThis.fetch = original; }
});
