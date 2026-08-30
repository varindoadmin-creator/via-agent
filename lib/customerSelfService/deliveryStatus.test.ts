import assert from 'node:assert/strict';
import test from 'node:test';
import { getCustomerOwnDeliveryStatus } from './deliveryStatus.ts';

function withMockZoho<T>(fn: () => Promise<T>): Promise<T> {
  const original = process.env.USE_MOCK_ZOHO;
  process.env.USE_MOCK_ZOHO = 'true';
  return fn().finally(() => { if (original === undefined) delete process.env.USE_MOCK_ZOHO; else process.env.USE_MOCK_ZOHO = original; });
}

test('Test 73 — an own order with no package data yet reports NOT_YET_DISPATCHED honestly, never an invented ETA', async () => {
  await withMockZoho(async () => {
    const result = await getCustomerOwnDeliveryStatus('CUST-001', 'SO-00001');
    assert.equal(result.outcome, 'FOUND');
    if (result.outcome === 'FOUND') assert.equal(result.result.status, 'NOT_YET_DISPATCHED');
  });
});

test('a wrong-customer SO number for delivery status is ORDER_NOT_FOUND, never disclosed', async () => {
  await withMockZoho(async () => {
    const result = await getCustomerOwnDeliveryStatus('CUST-002', 'SO-00001');
    assert.equal(result.outcome, 'ORDER_NOT_FOUND');
  });
});
