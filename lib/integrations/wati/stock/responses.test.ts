import assert from 'node:assert/strict';
import test from 'node:test';
import { renderStockResult, needQuantityPrompt, sufficientForRequest } from './responses.ts';

const ALL_RESULTS = ['AVAILABLE', 'SUFFICIENT', 'INSUFFICIENT', 'OUT_OF_STOCK', 'UNKNOWN'] as const;

test('no customer-facing template ever contains a bare confidential-looking number except the customer\'s own requested quantity echoed back', () => {
  for (const result of ALL_RESULTS) {
    const text = renderStockResult(result, { requestedQuantity: 20, requestedUnit: 'lembar', fulfilledByFallback: false });
    const numbers = text.match(/\d+/g) || [];
    for (const n of numbers) assert.equal(n, '20', `unexpected number "${n}" in template for ${result}: "${text}"`);
  }
});

test('Test 2 — count inquiry prompt never queries or states a quantity', () => {
  const text = needQuantityPrompt();
  assert.doesNotMatch(text, /\d/);
  assert.match(text, /berapa/i);
});

test('Test 4/8 — SUFFICIENT echoes only the requested quantity, via vendor or fallback, identically from the customer\'s perspective', () => {
  const viaVendor = renderStockResult('SUFFICIENT', { requestedQuantity: 20, requestedUnit: 'lembar', fulfilledByFallback: false });
  const viaFallback = renderStockResult('SUFFICIENT', { requestedQuantity: 20, requestedUnit: 'lembar', fulfilledByFallback: true });
  assert.match(viaVendor, /20 lembar/);
  assert.match(viaFallback, /20 lembar/);
  assert.doesNotMatch(viaFallback, /vendor|gudang|internal|varindo/i);
});

test('Test 9 — insufficient never exposes the partial amount', () => {
  const text = renderStockResult('INSUFFICIENT', { requestedQuantity: 20, requestedUnit: 'lembar', fulfilledByFallback: true });
  assert.doesNotMatch(text, /\d/);
});

test('existence-only SUFFICIENT (no requested quantity) falls back to the plain availability template', () => {
  const text = renderStockResult('SUFFICIENT', { requestedQuantity: null, requestedUnit: null, fulfilledByFallback: false });
  assert.doesNotMatch(text, /\d/);
});

test('sufficientForRequest defaults to a generic unit if none was captured', () => {
  assert.match(sufficientForRequest(5, null), /5 unit/);
});
