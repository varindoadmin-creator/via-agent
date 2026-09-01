import assert from 'node:assert/strict';
import test from 'node:test';
import { paretoBreakdown, describeConcentrationMagnitude } from './concentration.ts';

test('Test 27 — top 20% of a population accounts for the correct deterministic share', () => {
  const rows = [
    { name: 'A', value: 50 }, { name: 'B', value: 20 }, { name: 'C', value: 15 },
    { name: 'D', value: 10 }, { name: 'E', value: 5 },
  ];
  const result = paretoBreakdown(rows, 20); // 20% of 5 entities = 1 entity (A)
  assert.equal(result.entitiesInTopSlice, 1);
  assert.equal(result.metricShareInTopSlice, 0.5);
  assert.equal(result.total, 100);
});

test('paretoBreakdown rejects an invalid percent', () => {
  assert.throws(() => paretoBreakdown([{ name: 'A', value: 1 }], 0));
  assert.throws(() => paretoBreakdown([{ name: 'A', value: 1 }], 101));
});

test('an empty population still returns a defined, zero-share result rather than throwing', () => {
  const result = paretoBreakdown([], 50);
  assert.equal(result.total, 0);
  assert.equal(result.metricShareInTopSlice, 0);
});

test('Test 25 — concentration magnitude is descriptive, not an automatic "bad" label', () => {
  assert.equal(describeConcentrationMagnitude(0.05), 'LOW');
  assert.equal(describeConcentrationMagnitude(0.2), 'MODERATE');
  assert.equal(describeConcentrationMagnitude(0.35), 'ELEVATED');
  assert.equal(describeConcentrationMagnitude(0.6), 'HIGH');
});
