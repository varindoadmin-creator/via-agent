import assert from 'node:assert/strict';
import test from 'node:test';
import { priceOnly, priceWithStockAck, priceWithNeedQuantity, needsSizeClarification, priceNotFound, discountHandoff } from './responses.ts';

test('price-only template uses the Zoho item name, not the internal SKU', () => {
  const text = priceOnly('LAM-ATP11358M', "ATP 11358M - LAMITAK HPL 4'x10' | MARMO CLASSICO PRO", 'Rp2.886.000');
  assert.equal(text, "Untuk ATP 11358M - LAMITAK HPL 4'x10' | MARMO CLASSICO PRO, harga saat ini Rp2.886.000 termasuk PPN.");
  assert.doesNotMatch(text, /LAM-ATP11358M/);
});

test('Test 51 — combined price+stock-ack never states a quantity', () => {
  const text = priceWithStockAck('ATP11358M', 'x', 'Rp2.886.000');
  assert.match(text, /Rp2\.886\.000/);
  assert.doesNotMatch(text, /\d+\s*(lembar|pcs|unit)/i);
});

test('Test 52 — combined price+needs-quantity asks for the customer\'s requirement, no count disclosed', () => {
  const text = priceWithNeedQuantity('ATP11358M', 'x', 'Rp2.886.000');
  assert.match(text, /berapa lembar yang dibutuhkan/);
  assert.doesNotMatch(text, /\bada\s+\d+/i);
});

test('Test 56 — size clarification never guesses a price', () => {
  assert.doesNotMatch(needsSizeClarification(), /Rp\d/);
});

test('Test 57/25 — price-not-found routes to Admin, not a technical error', () => {
  assert.doesNotMatch(priceNotFound(), /error|null|undefined/i);
  assert.match(priceNotFound(), /Admin/);
});

test('Test 58 — discount handoff never states an internal threshold', () => {
  assert.doesNotMatch(discountHandoff(), /\d/);
});
