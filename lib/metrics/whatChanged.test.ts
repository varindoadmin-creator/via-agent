import assert from 'node:assert/strict';
import test from 'node:test';
import { decomposeMetricChange, identifyFunnelBottleneck } from './whatChanged.ts';

test('Test 33 — decomposition attributes a metric change to the correct dimension value', () => {
  const current = [{ dimensionValue: 'LAMITAK', metricValue: 100 }, { dimensionValue: 'EDL', metricValue: 50 }];
  const comparison = [{ dimensionValue: 'LAMITAK', metricValue: 60 }, { dimensionValue: 'EDL', metricValue: 55 }];
  const result = decomposeMetricChange(current, comparison);
  const lamitak = result.find(r => r.dimensionValue === 'LAMITAK')!;
  assert.equal(lamitak.change, 40);
  // Total change = (100+50) - (60+55) = 35; LAMITAK's 40 change is 40/35 of it.
  assert.equal(lamitak.contributionToChange, 40 / 35);
});

test('a dimension value present only in the comparison period is reported with current=0, not omitted', () => {
  const result = decomposeMetricChange([], [{ dimensionValue: 'X', metricValue: 10 }]);
  assert.equal(result.length, 1);
  assert.equal(result[0].current, 0);
  assert.equal(result[0].change, -10);
});

test('Test 31 — an unobserved funnel stage is never treated as a 100% drop-off', () => {
  const result = identifyFunnelBottleneck([
    { stage: 'INQUIRY', count: 100 }, { stage: 'PRODUCT', count: 80 },
    { stage: 'PRICE', count: 0 }, // never asked about price — not a failure, just unobserved
    { stage: 'STOCK', count: 40 }, { stage: 'QUOTE', count: 10 }, { stage: 'SALES_ORDER', count: 5 },
  ]);
  // The PRICE stage (count 0) must be skipped, not reported as the worst 100% drop-off.
  assert.notEqual(result?.stage, 'PRICE');
});

test('identifyFunnelBottleneck finds the largest real drop-off', () => {
  const result = identifyFunnelBottleneck([
    { stage: 'INQUIRY', count: 100 }, { stage: 'PRODUCT', count: 90 },
    { stage: 'PRICE', count: 85 }, { stage: 'STOCK', count: 80 },
    { stage: 'QUOTE', count: 10 }, { stage: 'SALES_ORDER', count: 8 },
  ]);
  assert.equal(result?.stage, 'STOCK');
  assert.equal(result?.nextStage, 'QUOTE');
});
