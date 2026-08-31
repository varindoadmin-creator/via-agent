import assert from 'node:assert/strict';
import test from 'node:test';
import { checkCommercialScope, UNSUPPORTED_BRAND_TEXT, UNSUPPORTED_CATEGORY_TEXT } from './productScope.ts';

test('Test 83 — a competitor HPL brand is out of scope and gets the approved decline text', () => {
  const result = checkCommercialScope('Ada HPL merek Wilsonart?');
  assert.equal(result.inScope, false);
  assert.equal(result.matchedUnsupportedBrand, 'WILSONART');
  assert.match(UNSUPPORTED_BRAND_TEXT, /EDL dan Lamitak/);
});

test('brands already routed by Phase 3\'s BRAND_VENDORS (AICA, TACO, CARTA, GRASMERINO, GREENLAM) are deliberately NOT declined here — a documented PRODUCT_DATA_CONFLICT, not silently resolved either way', () => {
  const result = checkCommercialScope('Ada HPL merek Taco?');
  assert.equal(result.inScope, true);
  assert.equal(result.matchedUnsupportedBrand, null);
});

test('Test 84 — plywood is out of scope and gets the approved decline text', () => {
  const result = checkCommercialScope('Ada plywood 18mm?');
  assert.equal(result.inScope, false);
  assert.equal(result.matchedUnsupportedCategory, 'PLYWOOD');
  assert.match(UNSUPPORTED_CATEGORY_TEXT, /tidak menjual plywood/);
});

test('a normal EDL/Lamitak product question is in scope', () => {
  const result = checkCommercialScope('Ada ATP11358M?');
  assert.equal(result.inScope, true);
  assert.equal(result.matchedUnsupportedBrand, null);
  assert.equal(result.matchedUnsupportedCategory, null);
});
