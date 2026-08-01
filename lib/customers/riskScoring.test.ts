import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateCustomerRisk } from './riskScoring.ts';

test('healthy customer remains low risk', () => {
  const result = calculateCustomerRisk({ overdueInvoiceCount: 0, issuedInvoiceCount: 10, averagePaymentDelayDays: 0, outstandingBalance: 0, creditLimit: 100_000_000, recentRevenue: 50_000_000, previousRevenue: 40_000_000, disputedOrCancelledCount: 0 });
  assert.equal(result.score, 0); assert.equal(result.level, 'low');
});

test('combines material risk factors into an explainable high score', () => {
  const result = calculateCustomerRisk({ overdueInvoiceCount: 8, issuedInvoiceCount: 10, averagePaymentDelayDays: 45, outstandingBalance: 120_000_000, creditLimit: 100_000_000, recentRevenue: 20_000_000, previousRevenue: 60_000_000, disputedOrCancelledCount: 2 });
  assert.ok(result.score >= 75); assert.equal(result.level, 'critical');
  assert.deepEqual(result.factors.map(f => f.key), ['overdue', 'delay', 'outstanding', 'credit', 'growth', 'exceptions']);
});

test('missing credit limit is unavailable and does not add risk', () => {
  const result = calculateCustomerRisk({ overdueInvoiceCount: 0, issuedInvoiceCount: 1, averagePaymentDelayDays: null, outstandingBalance: 20_000_000, creditLimit: null, recentRevenue: 0, previousRevenue: 0, disputedOrCancelledCount: 0 });
  assert.equal(result.creditUtilization, null);
  assert.ok(!result.factors.some(f => f.key === 'credit'));
});
