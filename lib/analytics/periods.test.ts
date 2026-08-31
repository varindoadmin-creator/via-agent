import assert from 'node:assert/strict';
import test from 'node:test';
import { comparePeriods, resolveTimeGrain, previousPeriod } from './periods.ts';

test('Test 101 — a zero previous-period denominator never produces a percentage (no divide-by-zero/Infinity)', () => {
  const result = comparePeriods(5, 0);
  assert.equal(result.percentChange, null);
});

test('a normal comparison computes a real percentage change', () => {
  const result = comparePeriods(15, 10);
  assert.equal(result.percentChange, 50);
});

test('Test 103 — small sample sizes are flagged, never overstated as a percentage claim', () => {
  const result = comparePeriods(3, 2);
  assert.equal(result.smallSample, true);
  assert.equal(result.percentChange, 50); // the number is still computed...
  // ...but callers must check smallSample before presenting it as meaningful.
});

test('a large-sample comparison is not flagged', () => {
  const result = comparePeriods(150, 100);
  assert.equal(result.smallSample, false);
});

test('THIS_MONTH and LAST_MONTH are contiguous, non-overlapping ranges', () => {
  const thisMonth = resolveTimeGrain('THIS_MONTH', new Date('2026-03-15T12:00:00Z'));
  const lastMonth = resolveTimeGrain('LAST_MONTH', new Date('2026-03-15T12:00:00Z'));
  assert.equal(lastMonth.end.getTime(), thisMonth.start.getTime());
});

test('previousPeriod returns an equal-length window immediately before the given range', () => {
  const range = { start: new Date('2026-03-01T00:00:00Z'), end: new Date('2026-03-08T00:00:00Z') };
  const prev = previousPeriod(range);
  assert.equal(prev.end.getTime(), range.start.getTime());
  assert.equal(range.start.getTime() - prev.start.getTime(), range.end.getTime() - range.start.getTime());
});
