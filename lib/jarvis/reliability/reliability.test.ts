import assert from 'node:assert/strict';
import test from 'node:test';
import { JarvisReliabilityError, classifyJarvisFailure } from './errors.ts';
import { retryTransient } from './retry.ts';
import { CircuitBreaker } from './circuitBreaker.ts';
import { needsManualReconciliation } from './workflow.ts';

test('retries only transient failures with bounded jitter', async () => {
  let calls = 0; const waits: number[] = [];
  const value = await retryTransient(async () => { calls += 1; if (calls < 3) throw new Error('fetch failed'); return 'ok'; }, { retries: 2, random: () => .5, sleep: async ms => { waits.push(ms); } });
  assert.equal(value, 'ok'); assert.equal(calls, 3); assert.deepEqual(waits, [300, 600]);
});
test('does not retry validation failures', async () => {
  let calls = 0;
  await assert.rejects(() => retryTransient(async () => { calls += 1; throw new Error('invalid customer id'); }), JarvisReliabilityError);
  assert.equal(calls, 1);
});
test('classifies Zoho rate limiting and stale approvals', () => {
  assert.equal(classifyJarvisFailure(new Error('Zoho API error 429')).code, 'RATE_LIMIT');
  assert.equal(classifyJarvisFailure(new Error('price changed after preview')).code, 'STALE_STATE');
});
test('opens a dependency circuit after repeated failures and probes after cooldown', () => {
  let now = 0; const breaker = new CircuitBreaker(2, 100, () => now);
  breaker.fail('zoho'); breaker.fail('zoho'); assert.equal(breaker.allow('zoho'), false);
  now = 101; assert.equal(breaker.allow('zoho'), true); assert.equal(breaker.allow('zoho'), false);
  breaker.succeed('zoho'); assert.equal(breaker.allow('zoho'), true);
});
test('identifies stale executing workflows for manual reconciliation, never retry', () => {
  assert.equal(needsManualReconciliation({ status: 'executing', approvedAt: '2026-01-01T00:00:00.000Z', expiresAt: '2026-01-01T01:00:00.000Z' }, Date.parse('2026-01-01T00:06:00.000Z')), true);
});
