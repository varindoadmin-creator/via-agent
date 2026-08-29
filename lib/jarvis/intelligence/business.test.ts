import assert from 'node:assert/strict';
import test from 'node:test';
import { compareObservedSales, identifyCustomerOpportunities, modelCustomerRecoveryScenario } from './business.ts';

const current = [
  { date: '2026-08-01', revenue: 60, customer: 'A', salesperson: 'R' },
  { date: '2026-08-02', revenue: 40, customer: 'B', salesperson: 'S' },
];
const previous = [
  { date: '2026-07-01', revenue: 100, customer: 'A', salesperson: 'R' },
  { date: '2026-07-02', revenue: 100, customer: 'C', salesperson: 'S' },
];

test('decomposes a verified sales movement without asserting a root cause', () => {
  const result = compareObservedSales({ label: 'Now', from: '2026-08-01', to: '2026-08-31' }, current, { label: 'Before', from: '2026-07-01', to: '2026-07-31' }, previous);
  assert.equal(result.revenue_change, -100);
  assert.equal(result.drivers.customer[0].name, 'C');
  assert.match(result.interpretation_limit, /does not prove why/i);
});

test('ranks declining and inactive customers with transparent arithmetic', () => {
  const opportunities = identifyCustomerOpportunities(current, previous);
  assert.deepEqual(opportunities.map(row => row.customer), ['C', 'A']);
  assert.equal(opportunities[0].segment, 'inactive');
  const scenario = modelCustomerRecoveryScenario(opportunities[0], 0.25);
  assert.equal(scenario.estimated_recovered_revenue, 25);
  assert.throws(() => modelCustomerRecoveryScenario(opportunities[0], 1.1));
});
