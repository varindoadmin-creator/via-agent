import assert from 'node:assert/strict';
import test from 'node:test';
import { enqueueJob, claimNextJobs, completeJob, failJob } from './queue.ts';

function setEnv() {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
}

/** A minimal in-memory stand-in for background_jobs, keyed by id, enforcing the idempotency_key unique index the same way Postgres/PostgREST would with `Prefer: resolution=ignore-duplicates`. */
function makeMockStore() {
  const rows: Array<Record<string, unknown>> = [];
  let idCounter = 0;

  function parseQuery(url: string): URLSearchParams {
    return new URLSearchParams(url.split('?')[1] || '');
  }
  function applyFilters(candidates: Array<Record<string, unknown>>, params: URLSearchParams): Array<Record<string, unknown>> {
    let result = candidates;
    for (const [key, value] of params.entries()) {
      if (key === 'select' || key === 'order' || key === 'limit') continue;
      if (value.startsWith('eq.')) { const v = value.slice(3); result = result.filter(r => String(r[key]) === v); }
      else if (value.startsWith('lte.')) { const v = value.slice(4); result = result.filter(r => String(r[key]) <= v); }
    }
    return result;
  }

  const fetchMock = (async (url: string, init?: RequestInit) => {
    const u = String(url);
    const method = init?.method || 'GET';
    const params = parseQuery(u);

    if (method === 'GET') {
      const matched = applyFilters(rows, params);
      return new Response(JSON.stringify(matched), { status: 200 });
    }
    if (method === 'POST') {
      const body = JSON.parse(String(init?.body));
      if (u.includes('on_conflict=idempotency_key')) {
        const existing = rows.find(r => r.idempotency_key === body.idempotency_key);
        if (existing) return new Response(null, { status: 201 }); // ignore-duplicates: no-op
      }
      const row = {
        id: `job-${++idCounter}`, organization_id: 'varindo', status: 'PENDING', attempt_count: 0,
        max_attempts: 5, next_attempt_at: new Date().toISOString(), last_error: null, resolution_note: null,
        version: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), payload: {},
        ...body,
      };
      rows.push(row);
      return new Response(JSON.stringify([row]), { status: 201 });
    }
    if (method === 'PATCH') {
      const matched = applyFilters(rows, params);
      if (!matched.length) return new Response('[]', { status: 200 });
      const body = JSON.parse(String(init?.body));
      const updated = matched.map(r => Object.assign(r, body));
      return new Response(JSON.stringify(updated), { status: 200 });
    }
    return new Response('[]', { status: 200 });
  }) as typeof fetch;

  return { fetchMock, rows };
}

test('Test 6 — a duplicate idempotencyKey enqueue never creates a second job row', async () => {
  setEnv();
  const store = makeMockStore();
  const original = globalThis.fetch;
  globalThis.fetch = store.fetchMock;
  try {
    await enqueueJob({ jobType: 'wati_send_retry', payload: { actionId: 'a1' }, idempotencyKey: 'sendOutreach:a1:1' });
    await enqueueJob({ jobType: 'wati_send_retry', payload: { actionId: 'a1' }, idempotencyKey: 'sendOutreach:a1:1' });
    assert.equal(store.rows.length, 1);
  } finally { globalThis.fetch = original; }
});

test('claimNextJobs only returns PENDING jobs whose next_attempt_at is due', async () => {
  setEnv();
  const store = makeMockStore();
  const original = globalThis.fetch;
  globalThis.fetch = store.fetchMock;
  try {
    await enqueueJob({ jobType: 'wati_send_retry', payload: {}, idempotencyKey: 'due-job' });
    await enqueueJob({ jobType: 'wati_send_retry', payload: {}, idempotencyKey: 'future-job' });
    const futureRow = store.rows.find(r => r.idempotency_key === 'future-job')!;
    futureRow.next_attempt_at = new Date(Date.now() + 60 * 60_000).toISOString();

    const claimed = await claimNextJobs('wati_send_retry', 10);
    assert.equal(claimed.length, 1);
    assert.equal(claimed[0].idempotencyKey, 'due-job');
    assert.equal(claimed[0].status, 'PROCESSING');
  } finally { globalThis.fetch = original; }
});

test('a completed job never gets claimed again', async () => {
  setEnv();
  const store = makeMockStore();
  const original = globalThis.fetch;
  globalThis.fetch = store.fetchMock;
  try {
    await enqueueJob({ jobType: 'salesperson_assign_retry', payload: {}, idempotencyKey: 'job-1' });
    const [claimed] = await claimNextJobs('salesperson_assign_retry', 10);
    await completeJob(claimed.id, claimed.version);
    const secondClaim = await claimNextJobs('salesperson_assign_retry', 10);
    assert.equal(secondClaim.length, 0);
  } finally { globalThis.fetch = original; }
});

test('Test 55 — a retryable failure schedules a later next_attempt_at via exponential backoff, never endless immediate retry', async () => {
  setEnv();
  const store = makeMockStore();
  const original = globalThis.fetch;
  globalThis.fetch = store.fetchMock;
  try {
    await enqueueJob({ jobType: 'wati_send_retry', payload: {}, idempotencyKey: 'job-backoff', maxAttempts: 10 });
    const [claimed] = await claimNextJobs('wati_send_retry', 10);
    const beforeRetry = Date.now();
    const afterFirstFailure = await failJob(claimed.id, claimed.version, 'transient network error');
    assert.equal(afterFirstFailure.status, 'PENDING');
    assert.ok(new Date(afterFirstFailure.nextAttemptAt).getTime() > beforeRetry);

    const [reclaimed] = await claimNextJobs('wati_send_retry', 10);
    // Not claimable yet because next_attempt_at is in the future — force it due for this test.
    if (!reclaimed) {
      const row = store.rows.find(r => r.id === afterFirstFailure.id)!;
      row.next_attempt_at = new Date().toISOString();
    }
    const [reclaimed2] = await claimNextJobs('wati_send_retry', 10);
    const afterSecondFailure = await failJob(reclaimed2.id, reclaimed2.version, 'transient network error');
    const firstDelay = new Date(afterFirstFailure.nextAttemptAt).getTime() - beforeRetry;
    const secondDelay = new Date(afterSecondFailure.nextAttemptAt).getTime() - beforeRetry;
    assert.ok(secondDelay > firstDelay, 'second backoff should be larger than the first');
  } finally { globalThis.fetch = original; }
});

test('Test 35 — a job exceeding max_attempts moves to DEAD, not endless PENDING', async () => {
  setEnv();
  const store = makeMockStore();
  const original = globalThis.fetch;
  globalThis.fetch = store.fetchMock;
  try {
    await enqueueJob({ jobType: 'wati_send_retry', payload: {}, idempotencyKey: 'job-exhaust', maxAttempts: 2 });
    let job = (await claimNextJobs('wati_send_retry', 10))[0];
    job = await failJob(job.id, job.version, 'still failing');
    assert.equal(job.status, 'PENDING'); // attempt 1 of 2

    store.rows.find(r => r.id === job.id)!.next_attempt_at = new Date().toISOString();
    job = (await claimNextJobs('wati_send_retry', 10))[0];
    job = await failJob(job.id, job.version, 'still failing');
    assert.equal(job.status, 'DEAD'); // attempt 2 of 2 exhausts the budget
  } finally { globalThis.fetch = original; }
});

test('a permanent failure skips straight to DEAD even on the first attempt', async () => {
  setEnv();
  const store = makeMockStore();
  const original = globalThis.fetch;
  globalThis.fetch = store.fetchMock;
  try {
    await enqueueJob({ jobType: 'wati_send_retry', payload: {}, idempotencyKey: 'job-permanent', maxAttempts: 5 });
    const [claimed] = await claimNextJobs('wati_send_retry', 10);
    const failed = await failJob(claimed.id, claimed.version, 'policy denial: SUPPRESSED', { permanent: true });
    assert.equal(failed.status, 'DEAD');
    assert.equal(failed.attemptCount, 1);
  } finally { globalThis.fetch = original; }
});
