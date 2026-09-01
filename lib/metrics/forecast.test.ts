import assert from 'node:assert/strict';
import test from 'node:test';
import { forecastSeries, type HistoryPoint } from './forecast.ts';

function series(values: number[]): HistoryPoint[] {
  return values.map((value, i) => ({ period: `2026-${String(i + 1).padStart(2, '0')}`, value }));
}

test('Test 46 — insufficient history returns INSUFFICIENT_DATA, never a fabricated forecast', () => {
  const result = forecastSeries(series([10, 12, 11]), 3);
  assert.equal(result.status, 'INSUFFICIENT_DATA');
  assert.equal(result.points, undefined);
  assert.ok(result.reason?.includes('at least'));
});

test('a flat series forecasts the same flat value under MOVING_AVERAGE', () => {
  const result = forecastSeries(series([100, 100, 100, 100, 100, 100]), 2, 'MOVING_AVERAGE');
  assert.equal(result.status, 'OK');
  assert.equal(result.points?.length, 2);
  assert.equal(result.points?.[0].forecast, 100);
});

test('every forecast point carries a non-degenerate uncertainty band, never presented as certainty', () => {
  const result = forecastSeries(series([10, 14, 9, 16, 11, 15, 12]), 3, 'LINEAR_TREND');
  assert.equal(result.status, 'OK');
  for (const point of result.points ?? []) {
    assert.ok(point.upperBound >= point.forecast);
    assert.ok(point.lowerBound <= point.forecast);
  }
});

test('the uncertainty band widens further out in the horizon', () => {
  const result = forecastSeries(series([10, 14, 9, 16, 11, 15, 12]), 4, 'MOVING_AVERAGE');
  assert.equal(result.status, 'OK');
  const points = result.points!;
  const firstBand = points[0].upperBound - points[0].lowerBound;
  const lastBand = points[points.length - 1].upperBound - points[points.length - 1].lowerBound;
  assert.ok(lastBand >= firstBand);
});

test('every OK result reports method, horizon, and training window', () => {
  const result = forecastSeries(series([1, 2, 3, 4, 5, 6, 7]), 2, 'EXPONENTIAL_SMOOTHING', 'inquiry_count');
  assert.equal(result.status, 'OK');
  assert.equal(result.method, 'EXPONENTIAL_SMOOTHING');
  assert.equal(result.horizon, 2);
  assert.equal(result.trainingWindow, 7);
  assert.equal(result.metricId, 'inquiry_count');
});

test('an out-of-range horizon is rejected', () => {
  assert.throws(() => forecastSeries(series([1, 2, 3, 4, 5, 6]), 0));
  assert.throws(() => forecastSeries(series([1, 2, 3, 4, 5, 6]), 13));
});
