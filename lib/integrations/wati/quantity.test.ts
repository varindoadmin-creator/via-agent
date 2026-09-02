import assert from 'node:assert/strict';
import test from 'node:test';
import { extractQuantity, isEdgeBandUnit, isSheetUnit } from './quantity.ts';

test('extracts the full HPL unit vocabulary (lembar/sheet/lbr/lb)', () => {
  for (const [text, expectedUnit] of [
    ['1 lembar', 'lembar'],
    ['1 sheet', 'sheet'],
    ['1 lbr', 'lbr'],
    ['1 lb', 'lb'],
  ] as const) {
    const result = extractQuantity(text);
    assert.equal(result?.quantity, 1);
    assert.equal(result?.unit, expectedUnit);
  }
});

test('extracts the full edge-band unit vocabulary (m/meter/mtr/roll)', () => {
  for (const [text, expectedQuantity, expectedUnit] of [
    ['15 meter', 15, 'meter'],
    ['15 m', 15, 'm'],
    ['15 mtr', 15, 'mtr'],
    ['1 roll', 1, 'roll'],
  ] as const) {
    const result = extractQuantity(text);
    assert.equal(result?.quantity, expectedQuantity);
    assert.equal(result?.unit, expectedUnit);
  }
});

test('isSheetUnit / isEdgeBandUnit classify the exact vocabulary given (2026-09-02): lembar/sheet/lbr/lb -> HPL, m/meter/mtr/roll -> edge band', () => {
  for (const unit of ['lembar', 'sheet', 'lbr', 'lb', 'LEMBAR']) {
    assert.equal(isSheetUnit(unit), true, `expected "${unit}" to be a sheet unit`);
    assert.equal(isEdgeBandUnit(unit), false, `expected "${unit}" to NOT be an edge-band unit`);
  }
  for (const unit of ['m', 'meter', 'mtr', 'roll', 'METER']) {
    assert.equal(isEdgeBandUnit(unit), true, `expected "${unit}" to be an edge-band unit`);
    assert.equal(isSheetUnit(unit), false, `expected "${unit}" to NOT be a sheet unit`);
  }
});

test('isSheetUnit / isEdgeBandUnit are false for null or an unrelated unit, never guess', () => {
  assert.equal(isSheetUnit(null), false);
  assert.equal(isEdgeBandUnit(null), false);
  assert.equal(isSheetUnit('pcs'), false);
  assert.equal(isEdgeBandUnit('pcs'), false);
});
