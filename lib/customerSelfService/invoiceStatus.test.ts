import assert from 'node:assert/strict';
import test from 'node:test';
import { getCustomerOwnInvoice } from './invoiceStatus.ts';

function withMockZoho<T>(fn: () => Promise<T>): Promise<T> {
  const original = process.env.USE_MOCK_ZOHO;
  process.env.USE_MOCK_ZOHO = 'true';
  return fn().finally(() => { if (original === undefined) delete process.env.USE_MOCK_ZOHO; else process.env.USE_MOCK_ZOHO = original; });
}

test('Test 69 — an own invoice resolves to a customer-safe DTO with no internal fields', async () => {
  await withMockZoho(async () => {
    const invoice = await getCustomerOwnInvoice('CUST-001', 'INV-001');
    assert.ok(invoice);
    assert.equal(invoice?.invoiceNumber, 'INV-001');
    const keys = Object.keys(invoice!);
    for (const forbidden of ['internalNotes', 'creditRisk', 'salespersonComments', 'margin', 'cost']) {
      assert.equal(keys.includes(forbidden), false);
    }
  });
});

test('Test 61/68 — a wrong-customer invoice number never resolves (structural ownership scoping)', async () => {
  await withMockZoho(async () => {
    const invoice = await getCustomerOwnInvoice('CUST-999', 'INV-001');
    assert.equal(invoice, null);
  });
});
