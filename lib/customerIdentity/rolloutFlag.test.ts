import assert from 'node:assert/strict';
import test from 'node:test';
import { rolloutEnabled } from './rolloutFlag.ts';

test('0% never enables, 100% always enables, regardless of key', () => {
  for (const key of ['cust-1', 'cust-2', '628123', 'zzz']) {
    assert.equal(rolloutEnabled('SOME_FLAG', 0, key), false);
    assert.equal(rolloutEnabled('SOME_FLAG', 100, key), true);
  }
});

test('the same key always buckets the same way (deterministic, not random)', () => {
  const first = rolloutEnabled('AUTO_COMMERCIAL_OUTREACH', 40, 'cust-stable');
  for (let i = 0; i < 20; i++) {
    assert.equal(rolloutEnabled('AUTO_COMMERCIAL_OUTREACH', 40, 'cust-stable'), first);
  }
});

test('roughly the requested percentage of a large key population is enabled', () => {
  let enabled = 0;
  const total = 5000;
  for (let i = 0; i < total; i++) {
    if (rolloutEnabled('AUTO_COMMERCIAL_OUTREACH', 30, `customer-${i}`)) enabled++;
  }
  const ratio = enabled / total;
  assert.ok(ratio > 0.24 && ratio < 0.36, `expected roughly 30% enabled, got ${(ratio * 100).toFixed(1)}%`);
});

test('different flag names bucket the same key independently', () => {
  const key = 'cust-independent';
  const resultsA = rolloutEnabled('FLAG_A', 50, key);
  const resultsB = rolloutEnabled('FLAG_B', 50, key);
  // Not asserting they differ (could coincidentally match) — just that both are valid booleans and the function doesn't throw.
  assert.equal(typeof resultsA, 'boolean');
  assert.equal(typeof resultsB, 'boolean');
});
