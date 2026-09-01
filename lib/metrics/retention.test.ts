import assert from 'node:assert/strict';
import test from 'node:test';
import { computeCustomerRetention } from './retention.ts';

test('Test 28 — retention is explicitly customer retention, never conflated with revenue retention', () => {
  const result = computeCustomerRetention({
    periodALabel: 'Jan', periodACustomerIds: ['a', 'b', 'c'],
    periodBLabel: 'Feb', periodBCustomerIds: ['a', 'b', 'd'],
  });
  assert.match(result.definition, /customer retention/i);
  assert.doesNotMatch(result.definition, /revenue retention:/i); // must never be phrased as if defining revenue retention
  assert.equal(result.retentionRate, 2 / 3);
  assert.deepEqual(result.retainedCustomerIds.sort(), ['a', 'b']);
  assert.deepEqual(result.lapsedCustomerIds, ['c']);
});

test('an empty Period A returns a null rate, never a division-by-zero artifact', () => {
  const result = computeCustomerRetention({ periodALabel: 'Jan', periodACustomerIds: [], periodBLabel: 'Feb', periodBCustomerIds: ['a'] });
  assert.equal(result.retentionRate, null);
});
