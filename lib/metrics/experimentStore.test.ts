import assert from 'node:assert/strict';
import test from 'node:test';
import { createExperiment, recordExperimentResult, MIN_EXPERIMENT_SAMPLE_SIZE } from './experimentStore.ts';

function setEnv() {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
}

function makeMockStore() {
  let row: Record<string, unknown> | null = null;
  let idCounter = 0;
  const fetchMock = (async (url: string, init?: RequestInit) => {
    const u = String(url); const method = init?.method || 'GET';
    if (u.includes('/management_experiments') && method === 'POST') {
      const body = JSON.parse(String(init?.body));
      row = { id: `exp-${++idCounter}`, name: '', hypothesis: '', metric_id: '', started_at: new Date().toISOString(), ended_at: null, before_value: null, before_sample_size: 0, after_value: null, after_sample_size: 0, status: 'RUNNING', conclusion: null, conclusion_notes: null, created_by: 'director', version: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...body };
      return new Response(JSON.stringify([row]), { status: 200 });
    }
    if (u.includes('/management_experiments') && u.includes('id=eq.') && method === 'GET') {
      return new Response(JSON.stringify(row ? [row] : []), { status: 200 });
    }
    if (u.includes('/management_experiments') && method === 'PATCH') {
      if (!row) return new Response('[]', { status: 200 });
      const body = JSON.parse(String(init?.body));
      row = { ...row, ...body };
      return new Response(JSON.stringify([row]), { status: 200 });
    }
    return new Response('[]', { status: 200 });
  }) as typeof fetch;
  return { fetchMock, getRow: () => row };
}

test('Test 36 — an experiment below the minimum sample size on either side is marked INSUFFICIENT_DATA, never a declared success/failure', async () => {
  setEnv();
  const store = makeMockStore();
  const original = globalThis.fetch;
  globalThis.fetch = store.fetchMock;
  try {
    const experiment = await createExperiment({ name: 'Follow-up timing', hypothesis: 'Earlier follow-up improves conversion', metricId: 'quotation_conversion_rate', beforeValue: 0.2, beforeSampleSize: 3, createdBy: 'director' });
    const result = await recordExperimentResult(experiment.id, experiment.version, { afterValue: 0.4, afterSampleSize: 3, higherIsBetter: true });
    assert.equal(result.status, 'INSUFFICIENT_DATA');
    assert.equal(result.conclusion, null);
    assert.ok(result.conclusionNotes?.includes(String(MIN_EXPERIMENT_SAMPLE_SIZE)));
  } finally { globalThis.fetch = original; }
});

test('an adequately-sampled experiment with a material improvement concludes IMPROVED', async () => {
  setEnv();
  const store = makeMockStore();
  const original = globalThis.fetch;
  globalThis.fetch = store.fetchMock;
  try {
    const experiment = await createExperiment({ name: 'x', hypothesis: 'y', metricId: 'quotation_conversion_rate', beforeValue: 0.2, beforeSampleSize: 20, createdBy: 'director' });
    const result = await recordExperimentResult(experiment.id, experiment.version, { afterValue: 0.3, afterSampleSize: 20, higherIsBetter: true });
    assert.equal(result.status, 'CONCLUDED');
    assert.equal(result.conclusion, 'IMPROVED');
  } finally { globalThis.fetch = original; }
});

test('higherIsBetter=false flips the IMPROVED/WORSENED labeling without changing the underlying math', async () => {
  setEnv();
  const store = makeMockStore();
  const original = globalThis.fetch;
  globalThis.fetch = store.fetchMock;
  try {
    const experiment = await createExperiment({ name: 'x', hypothesis: 'y', metricId: 'median_resolution_minutes', beforeValue: 60, beforeSampleSize: 20, createdBy: 'director' });
    const result = await recordExperimentResult(experiment.id, experiment.version, { afterValue: 90, afterSampleSize: 20, higherIsBetter: false });
    assert.equal(result.status, 'CONCLUDED');
    assert.equal(result.conclusion, 'WORSENED');
  } finally { globalThis.fetch = original; }
});

test('a change below the 5% materiality threshold concludes NO_CHANGE', async () => {
  setEnv();
  const store = makeMockStore();
  const original = globalThis.fetch;
  globalThis.fetch = store.fetchMock;
  try {
    const experiment = await createExperiment({ name: 'x', hypothesis: 'y', metricId: 'x', beforeValue: 100, beforeSampleSize: 20, createdBy: 'director' });
    const result = await recordExperimentResult(experiment.id, experiment.version, { afterValue: 101, afterSampleSize: 20, higherIsBetter: true });
    assert.equal(result.conclusion, 'NO_CHANGE');
  } finally { globalThis.fetch = original; }
});
