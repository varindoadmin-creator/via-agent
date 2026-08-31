import assert from 'node:assert/strict';
import test from 'node:test';
import { hasSufficientSample, hasPersisted, hasRecovered } from './samplingGuards.ts';

test('Test 124 — a tiny sample never satisfies the minimum-sample guard', () => {
  assert.equal(hasSufficientSample(2, 10), false);
  assert.equal(hasSufficientSample(10, 10), true);
});

test('Test 36 — a single breaching pass does not satisfy a persistence requirement of 2', () => {
  assert.equal(hasPersisted(1, 2), false);
  assert.equal(hasPersisted(2, 2), true);
});

test('Test 43 — a single normal pass does not trigger recovery when 2 windows are required', () => {
  assert.equal(hasRecovered(1, 2), false);
  assert.equal(hasRecovered(2, 2), true);
});
