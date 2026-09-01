import assert from 'node:assert/strict';
import test from 'node:test';
import { runScenario, scenarioQuotationConversionChange, scenarioAverageOrderValueChange } from './scenario.ts';

test('Test 47 — every scenario result is structurally marked as a scenario, never a forecast', () => {
  const result = runScenario({ metricId: 'x', metricLabel: 'X', baselineValue: 100, assumptionLabel: 'test', assumptionType: 'PERCENT', assumptionDelta: 0.1 });
  assert.equal(result.scenario, true);
  assert.match(result.disclaimer, /not a forecast/i);
});

test('a PERCENT assumption applies the delta multiplicatively to the baseline', () => {
  const result = runScenario({ metricId: 'x', metricLabel: 'X', baselineValue: 200, assumptionLabel: '+10%', assumptionType: 'PERCENT', assumptionDelta: 0.1 });
  assert.ok(Math.abs(result.assumedValue - 220) < 1e-9);
  assert.ok(Math.abs(result.absoluteChange - 20) < 1e-9);
  assert.ok(Math.abs((result.percentChange ?? 0) - 0.1) < 1e-9);
});

test('an ABSOLUTE assumption replaces the baseline outright', () => {
  const result = runScenario({ metricId: 'x', metricLabel: 'X', baselineValue: 0.2, assumptionLabel: 'target 25%', assumptionType: 'ABSOLUTE', assumptionDelta: 0.25 });
  assert.equal(result.assumedValue, 0.25);
});

test('quotation conversion scenario computes additional orders and value from the stated assumption only', () => {
  const result = scenarioQuotationConversionChange({ quotationCount: 100, currentConversionRate: 0.2, targetConversionRate: 0.25, averageOrderValue: 1_000_000 });
  assert.ok(Math.abs(result.additionalOrders - 5) < 1e-9);
  assert.ok(Math.abs(result.additionalSalesOrderValue - 5_000_000) < 1e-3);
  assert.equal(result.scenario, true);
});

test('quotation conversion scenario rejects out-of-range rates', () => {
  assert.throws(() => scenarioQuotationConversionChange({ quotationCount: 10, currentConversionRate: 0.2, targetConversionRate: 1.5, averageOrderValue: 1 }));
});

test('average order value scenario computes additional SO value across the order count', () => {
  const result = scenarioAverageOrderValueChange({ currentAverageOrderValue: 1_000_000, percentIncrease: 0.1, orderCount: 50 });
  assert.equal(result.additionalSalesOrderValue, 100_000 * 50);
});
