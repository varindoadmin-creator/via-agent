import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateAverageOrderValue, calculateConcentration, calculateGrossMargin, calculateGrowth } from './metrics.ts';

test('calculates growth and safely handles a zero comparison base', () => {
  assert.equal(calculateGrowth(120, 100), 0.2);
  assert.equal(calculateGrowth(120, 0), null);
});

test('calculates AOV, gross margin, and concentration deterministically', () => {
  assert.equal(calculateAverageOrderValue(300, 3), 100);
  assert.deepEqual(calculateGrossMargin(1_000, 750), { gross_profit: 250, gross_margin: 0.25 });
  const concentration = calculateConcentration([{ name: 'A', value: 70 }, { name: 'B', value: 30 }], 1);
  assert.equal(concentration.top[0].share, 0.7);
  assert.equal(concentration.top_share, 0.7);
});
