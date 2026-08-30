import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveStockStatusFromInquiry } from './draft.ts';

test('Test 38/39 — a linked stock inquiry with no final_availability yet stays PENDING, never a guess', () => {
  assert.equal(deriveStockStatusFromInquiry(null), 'PENDING');
});

test('AVAILABLE and SUFFICIENT both map to the customer-safe SUFFICIENT status', () => {
  assert.equal(deriveStockStatusFromInquiry('AVAILABLE'), 'SUFFICIENT');
  assert.equal(deriveStockStatusFromInquiry('SUFFICIENT'), 'SUFFICIENT');
});

test('OUT_OF_STOCK and INSUFFICIENT map through unchanged, never exposing a quantity', () => {
  assert.equal(deriveStockStatusFromInquiry('OUT_OF_STOCK'), 'OUT_OF_STOCK');
  assert.equal(deriveStockStatusFromInquiry('INSUFFICIENT'), 'INSUFFICIENT');
});
