import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeItemCode, itemCodesMatch, extractBrandPrefix, isNewCollection, isBestSelling } from './normalizeItemCode.ts';

test('Product/Pricing brief section 4 — space, hyphen, and case variants normalize to the same canonical code', () => {
  assert.equal(normalizeItemCode('ATP 11358M'), normalizeItemCode('ATP-11358M'));
  assert.equal(normalizeItemCode('ATP-11358M'), normalizeItemCode('atp11358m'));
  assert.equal(itemCodesMatch('ATP 11358M', 'atp-11358m'), true);
});

test('hyphen stripping does not change existing prefix-classification behavior', () => {
  assert.equal(extractBrandPrefix('ATP-11358M'), 'ATP');
  assert.equal(isNewCollection('ATP-11358M'), true);
  assert.equal(isBestSelling('WY-5217'), true);
});

test('normalizeItemCode still handles a plain code with no separators', () => {
  assert.equal(normalizeItemCode('DXO5338D'), 'DXO5338D');
});

test('an empty or missing code never throws', () => {
  assert.equal(normalizeItemCode(''), '');
});
