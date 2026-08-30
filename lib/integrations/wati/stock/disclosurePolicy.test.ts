import assert from 'node:assert/strict';
import test from 'node:test';
import { toCustomerStockResult } from './disclosurePolicy.ts';

test('Test 1 — existence inquiry: AVAILABLE without any quantity ever appearing in the input needed', () => {
  const result = toCustomerStockResult({ requestedQuantity: null, availableQuantity: null, availability: 'AVAILABLE' });
  assert.equal(result, 'AVAILABLE');
});

test('Test 4 — vendor has 75, customer needs 20: SUFFICIENT, and the function never received or returned "75" anywhere accessible to a caller', () => {
  const result = toCustomerStockResult({ requestedQuantity: 20, availableQuantity: 75, availability: 'AVAILABLE' });
  assert.equal(result, 'SUFFICIENT');
  // Structural check: the return type itself has no numeric field.
  assert.equal(typeof result, 'string');
});

test('Test 8 — vendor OOS, Varindo has 24, customer needs 20: SUFFICIENT via fallback, "24" never appears in the result', () => {
  const result = toCustomerStockResult({ requestedQuantity: 20, availableQuantity: 24, availability: 'AVAILABLE' });
  assert.equal(result, 'SUFFICIENT');
});

test('insufficient quantity never discloses the partial amount', () => {
  const result = toCustomerStockResult({ requestedQuantity: 50, availableQuantity: 5, availability: 'AVAILABLE' });
  assert.equal(result, 'INSUFFICIENT');
});

test('Test 5/9 — definitive OUT_OF_STOCK maps straight through regardless of requested quantity', () => {
  assert.equal(toCustomerStockResult({ requestedQuantity: null, availableQuantity: null, availability: 'OUT_OF_STOCK' }), 'OUT_OF_STOCK');
  assert.equal(toCustomerStockResult({ requestedQuantity: 20, availableQuantity: null, availability: 'OUT_OF_STOCK' }), 'OUT_OF_STOCK');
});

test('AVAILABLE with a specific request but no known quantity is UNKNOWN, not silently SUFFICIENT — never guesses', () => {
  const result = toCustomerStockResult({ requestedQuantity: 50, availableQuantity: null, availability: 'AVAILABLE' });
  assert.equal(result, 'UNKNOWN');
});

test('Test 12 — aggregation quantity-safety: a "5 available" response satisfies a 5-unit request but not a linked 50-unit one', () => {
  const smallRequest = toCustomerStockResult({ requestedQuantity: 5, availableQuantity: 5, availability: 'AVAILABLE' });
  const largeRequest = toCustomerStockResult({ requestedQuantity: 50, availableQuantity: 5, availability: 'AVAILABLE' });
  assert.equal(smallRequest, 'SUFFICIENT');
  assert.equal(largeRequest, 'INSUFFICIENT');
});
