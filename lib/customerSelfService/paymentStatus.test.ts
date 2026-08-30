import assert from 'node:assert/strict';
import test from 'node:test';
import { getCustomerOwnPaymentStatus } from './paymentStatus.ts';

function withMockZoho<T>(fn: () => Promise<T>): Promise<T> {
  const original = process.env.USE_MOCK_ZOHO;
  process.env.USE_MOCK_ZOHO = 'true';
  return fn().finally(() => { if (original === undefined) delete process.env.USE_MOCK_ZOHO; else process.env.USE_MOCK_ZOHO = original; });
}

test('Test 71 — an unpaid invoice reports NOT_RECORDED, never a false paid claim', async () => {
  await withMockZoho(async () => {
    const result = await getCustomerOwnPaymentStatus('CUST-001', 'INV-001');
    assert.equal(result.outcome, 'NOT_RECORDED');
  });
});

test('Test 53/61 — an unknown/cross-customer invoice number is NOT_FOUND, never searched across customers', async () => {
  await withMockZoho(async () => {
    const result = await getCustomerOwnPaymentStatus('CUST-999', 'INV-001');
    assert.equal(result.outcome, 'NOT_FOUND');
  });
});
