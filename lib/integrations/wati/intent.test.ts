import assert from 'node:assert/strict';
import test from 'node:test';
import { detectIntentDeterministic } from './intent.ts';
import { extractQuantity } from './quantity.ts';

test('Greeting: pure "Halo" is GREETING with no product', () => {
  const result = detectIntentDeterministic('Halo');
  assert.equal(result?.intent, 'GREETING');
  assert.equal(result?.productCodeCandidate, null);
  assert.equal(result?.deterministic, true);
});

test('Generic brand website inquiry: PRODUCT_INQUIRY with brand=LAMITAK, no code needed', () => {
  const result = detectIntentDeterministic('Halo Admin Varindo, saya ingin bertanya tentang produk Lamitak.');
  assert.equal(result?.intent, 'PRODUCT_INQUIRY');
  assert.equal(result?.brand, 'LAMITAK');
  assert.equal(result?.source, 'WEBSITE');
});

test('Stock check: explicit stock keyword with a resolvable code', () => {
  const result = detectIntentDeterministic('ATP11358M ada stock?');
  assert.equal(result?.intent, 'STOCK_CHECK');
  assert.equal(result?.productCodeCandidate, 'ATP11358M');
});

test('Stock check with quantity: code, intent, and quantity all extracted', () => {
  const text = 'DWE9004L ada 20 lembar?';
  const result = detectIntentDeterministic(text);
  assert.equal(result?.intent, 'STOCK_CHECK');
  assert.equal(result?.productCodeCandidate, 'DWE9004L');
  const quantity = extractQuantity(text);
  assert.deepEqual(quantity, { quantity: 20, unit: 'lembar' });
});

test('Unknown product: "ada?" without a resolvable code still routes to STOCK_CHECK with no code (caller must clarify, never guess)', () => {
  const result = detectIntentDeterministic('Yang motif putih ada?');
  assert.equal(result?.intent, 'STOCK_CHECK');
  assert.equal(result?.productCodeCandidate, null);
});

test('Vague product mention with no signal word: routes to PRODUCT_INQUIRY with no product/brand (must clarify)', () => {
  const result = detectIntentDeterministic('Saya mau tanya yang motif marmer');
  assert.equal(result?.intent, 'PRODUCT_INQUIRY');
  assert.equal(result?.productCodeCandidate, null);
  assert.equal(result?.brand, null);
});

test('Human request: explicit ask to talk to admin', () => {
  const result = detectIntentDeterministic('Saya mau bicara sama admin');
  assert.equal(result?.intent, 'HUMAN_REQUEST');
});

test('Human request pattern does not false-positive on the website prefix mentioning "Admin Varindo"', () => {
  const result = detectIntentDeterministic('Halo Admin Varindo, saya ingin bertanya tentang produk Lamitak.');
  assert.notEqual(result?.intent, 'HUMAN_REQUEST');
});

test('quantity extraction ignores a bare item code (no false positive on digits in a code)', () => {
  assert.equal(extractQuantity('ATP11358M ada stock?'), null);
});
