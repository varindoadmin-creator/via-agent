import assert from 'node:assert/strict';
import test from 'node:test';
import { extractSizeFromItemName, detectCustomerStatedSize, inferSizeFromMotifDigits, extractMotifDigits } from './lamitakSize.ts';

test('extracts size from the resolved item\'s own name (authoritative)', () => {
  assert.equal(extractSizeFromItemName("ATP 11358M - LAMITAK HPL 4'x10' | MARMO CLASSICO PRO"), '4x10');
  assert.equal(extractSizeFromItemName("ART 1009 XM - LAMITAK HPL 4' x 8' | LUNIGIANA UNO"), '4x8');
});

test('brief section 6 — validated digit-count heuristic: 5 digits -> 4x10, 4 digits -> 4x8', () => {
  assert.equal(extractMotifDigits('ATP 11358M'), '11358');
  assert.equal(inferSizeFromMotifDigits('11358'), '4x10');
  assert.equal(extractMotifDigits('ART 1009XM'), '1009');
  assert.equal(inferSizeFromMotifDigits('1009'), '4x8');
});

test('customer-stated size overrides digit inference (brief section 6)', () => {
  assert.equal(detectCustomerStatedSize('mau yang jumbo'), '4x10');
  assert.equal(detectCustomerStatedSize('yang 3 meter'), '4x10');
  assert.equal(detectCustomerStatedSize("4'x10'"), '4x10');
  assert.equal(detectCustomerStatedSize('4x8 saja'), '4x8');
});

test('no size signal present returns null, never guessed', () => {
  assert.equal(detectCustomerStatedSize('ATP11358M harganya berapa?'), null);
  assert.equal(inferSizeFromMotifDigits('123'), null);
});
