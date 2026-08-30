import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyQuantityInquiry } from './quantityInquiryType.ts';

test('Type A — existence inquiry: "ATP11358M ada stok?" has no quantity, not a count question', () => {
  const result = classifyQuantityInquiry('ATP11358M ada stok?');
  assert.equal(result.type, 'EXISTENCE');
  assert.equal(result.quantity, null);
});

test('Type B — quantity-specific: "ATP11358M ada 20 lembar?" extracts the quantity directly', () => {
  const result = classifyQuantityInquiry('ATP11358M ada 20 lembar?');
  assert.equal(result.type, 'QUANTITY_SPECIFIC');
  assert.deepEqual(result.quantity, { quantity: 20, unit: 'lembar' });
});

test('Test 2 — Type C — count inquiry: "ATP11358M ada berapa lembar?" asks a count question with no number of its own', () => {
  const result = classifyQuantityInquiry('ATP11358M ada berapa lembar?');
  assert.equal(result.type, 'COUNT_INQUIRY');
  assert.equal(result.quantity, null);
});

test('an explicit number wins over "berapa" appearing in the same message', () => {
  const result = classifyQuantityInquiry('ada berapa ya, saya butuh 20 lembar');
  assert.equal(result.type, 'QUANTITY_SPECIFIC');
});
