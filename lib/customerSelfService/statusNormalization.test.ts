import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeOrderStatus, normalizeInvoiceStatus, deriveDeliveryStatus } from './statusNormalization.ts';

test('Section 9 — order status normalization maps real Zoho values to customer-facing language', () => {
  assert.equal(normalizeOrderStatus('draft'), 'RECEIVED');
  assert.equal(normalizeOrderStatus('pending_approval'), 'RECEIVED');
  assert.equal(normalizeOrderStatus('confirmed'), 'CONFIRMED');
  assert.equal(normalizeOrderStatus('open'), 'CONFIRMED');
  assert.equal(normalizeOrderStatus('partially_invoiced'), 'PARTIALLY_FULFILLED');
  assert.equal(normalizeOrderStatus('invoiced'), 'FULFILLED');
  assert.equal(normalizeOrderStatus('void'), 'CANCELLED');
});

test('an unrecognized Zoho order status is UNKNOWN, never guessed', () => {
  assert.equal(normalizeOrderStatus('something_new_from_zoho'), 'UNKNOWN');
  assert.equal(normalizeOrderStatus(null), 'UNKNOWN');
});

test('Test 12 — invoice status uses real status/balance, never guesses from age', () => {
  assert.equal(normalizeInvoiceStatus('paid', 0), 'PAID');
  assert.equal(normalizeInvoiceStatus('partially_paid', 50000), 'PARTIALLY_PAID');
  assert.equal(normalizeInvoiceStatus('overdue', 100000), 'OVERDUE');
  assert.equal(normalizeInvoiceStatus('void', 0), 'VOID');
  assert.equal(normalizeInvoiceStatus('unpaid', 100000), 'UNPAID');
  assert.equal(normalizeInvoiceStatus('sent', 0), 'PAID');
});

test('Test 73 — no packages at all is NOT_YET_DISPATCHED, never invented dispatch data', () => {
  assert.equal(deriveDeliveryStatus([], []), 'NOT_YET_DISPATCHED');
});

test('all packages not_shipped is PROCESSING', () => {
  assert.equal(deriveDeliveryStatus([{ status: 'not_shipped' }, { status: 'not_shipped' }], []), 'PROCESSING');
});

test('a mix of shipped and not_shipped packages is PARTIALLY_DISPATCHED', () => {
  assert.equal(deriveDeliveryStatus([{ status: 'shipped' }, { status: 'not_shipped' }], []), 'PARTIALLY_DISPATCHED');
});

test('all packages shipped with a delivered shipment order is DELIVERED', () => {
  assert.equal(deriveDeliveryStatus([{ status: 'shipped' }], [{ status: 'delivered' }]), 'DELIVERED');
});

test('all packages shipped with no delivered confirmation yet is DISPATCHED, not assumed delivered', () => {
  assert.equal(deriveDeliveryStatus([{ status: 'shipped' }], [{ status: 'shipped' }]), 'DISPATCHED');
  assert.equal(deriveDeliveryStatus([{ status: 'shipped' }], []), 'DISPATCHED');
});
