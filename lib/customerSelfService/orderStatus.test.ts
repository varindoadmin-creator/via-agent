import assert from 'node:assert/strict';
import test from 'node:test';
import { getCustomerOwnOrderStatus, getCustomerOwnOrderHistory, getCustomerOwnLastOrder } from './orderStatus.ts';

function withMockZoho<T>(fn: () => Promise<T>): Promise<T> {
  const original = process.env.USE_MOCK_ZOHO;
  process.env.USE_MOCK_ZOHO = 'true';
  return fn().finally(() => { if (original === undefined) delete process.env.USE_MOCK_ZOHO; else process.env.USE_MOCK_ZOHO = original; });
}

test('Test 67 — an own order resolves with a customer-safe status DTO', async () => {
  await withMockZoho(async () => {
    const result = await getCustomerOwnOrderStatus('CUST-001', 'SO-00001');
    assert.ok(result);
    assert.equal(result?.orderNumber, 'SO-00001');
    assert.equal(result?.status, 'CONFIRMED'); // mock SO status is 'open' -> mapped through normalizeOrderStatus
  });
});

test('Test 68 — an SO belonging to another customer returns null (structural ownership scoping), no disclosure', async () => {
  await withMockZoho(async () => {
    const result = await getCustomerOwnOrderStatus('CUST-002', 'SO-00001');
    assert.equal(result, null);
  });
});

test('order history is customer-scoped and DTO-shaped, never a raw Zoho object', async () => {
  await withMockZoho(async () => {
    const history = await getCustomerOwnOrderHistory('CUST-001', 5);
    assert.ok(history.length >= 1);
    assert.ok(history.every(o => Object.keys(o).sort().join(',') === 'items,orderDate,orderNumber,status'));
  });
});

test('last order returns the single most recent record for that customer only', async () => {
  await withMockZoho(async () => {
    const last = await getCustomerOwnLastOrder('CUST-001');
    assert.ok(last);
    const noneForOther = await getCustomerOwnLastOrder('CUST-999');
    assert.equal(noneForOther, null);
  });
});
