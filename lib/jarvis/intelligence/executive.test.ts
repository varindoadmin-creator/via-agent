import assert from 'node:assert/strict';
import test from 'node:test';
import { buildExecutiveSalesAssessment } from './executive.ts';

test('flags declining revenue and customer concentration without inventing a cause', () => {
  const result = buildExecutiveSalesAssessment({
    label: 'August', revenue: 80, invoiceCount: 8, averageInvoiceValue: 10,
    topCustomerName: 'Customer A', topCustomerShare: 0.5,
  }, { label: 'July', revenue: 100, invoiceCount: 10, averageInvoiceValue: 10 });
  assert.equal(result.growth, -0.2);
  assert.equal(result.concerns.length, 2);
  assert.match(result.actions[0].action, /declines/);
});
