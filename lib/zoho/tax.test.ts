import assert from 'node:assert/strict';
import test from 'node:test';
import { computeDisplayPrice, formatIDR } from './tax.ts';

test('11% PPN on a real validated item (ATP 11358M: 2,600,000 excl -> 2,886,000 incl)', () => {
  assert.equal(computeDisplayPrice(2_600_000, 11), 2_886_000);
});

test('no floating-point drift on repeated computation', () => {
  const results = new Set<number>();
  for (let i = 0; i < 50; i++) results.add(computeDisplayPrice(2_600_000, 11));
  assert.equal(results.size, 1);
});

test('zero tax rate returns the base rate unchanged', () => {
  assert.equal(computeDisplayPrice(1_000_000, 0), 1_000_000);
});

test('handles a non-round base rate without float error (e.g. an odd rupiah amount)', () => {
  assert.equal(computeDisplayPrice(333_333, 11), Math.round(333_333 * 1.11));
});

test('formatIDR matches brief section 28\'s exact expected format, no space after Rp', () => {
  assert.equal(formatIDR(2_886_000), 'Rp2.886.000');
});
