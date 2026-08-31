import assert from 'node:assert/strict';
import test from 'node:test';
import { getActivePaymentDestination } from './paymentDestination.ts';

test('Test 87 — only the ACTIVE approved BCA destination is ever returned', () => {
  const destination = getActivePaymentDestination();
  assert.ok(destination);
  assert.equal(destination?.status, 'ACTIVE');
  assert.equal(destination?.bank, 'BCA');
  assert.equal(destination?.accountNumber, '7610516224');
  assert.equal(destination?.accountName, 'CV. VARINDO FORMA HUTAMA');
});
