import assert from 'node:assert/strict';
import test from 'node:test';
import { getCustomerOutstandingInvoices, getCustomerReceivableSummary } from './outstandingInvoices.ts';

function withMockZoho<T>(fn: () => Promise<T>): Promise<T> {
  const original = process.env.USE_MOCK_ZOHO;
  process.env.USE_MOCK_ZOHO = 'true';
  return fn().finally(() => { if (original === undefined) delete process.env.USE_MOCK_ZOHO; else process.env.USE_MOCK_ZOHO = original; });
}

test('Test 14 — outstanding invoices are scoped to the requesting customer only', async () => {
  await withMockZoho(async () => {
    const invoices = await getCustomerOutstandingInvoices('CUST-001', 5);
    assert.ok(invoices.every(i => i.balanceDue > 0));
    const none = await getCustomerOutstandingInvoices('CUST-999', 5);
    assert.equal(none.length, 0);
  });
});

test('Section 23/24 — receivable summary sums only this customer\'s own balances, never company-wide AR', async () => {
  await withMockZoho(async () => {
    const summary = await getCustomerReceivableSummary('CUST-001');
    assert.ok(summary.totalOutstanding > 0);
    assert.equal(summary.invoiceCount, 1);
  });
});
