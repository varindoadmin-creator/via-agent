import assert from 'node:assert/strict';
import test from 'node:test';
import { isBeforeCutoff, computeDispatchCommitment, checkJavaEligibility, FREE_SHIPPING_JAVA_TEXT } from './shippingPolicy.ts';

test('Test 85 — an order before 14:00 WIB on a weekday is before cutoff', () => {
  // 2026-01-05 is a Monday. 06:00Z = 13:00 WIB (before 14:00 cutoff).
  assert.equal(isBeforeCutoff(new Date('2026-01-05T06:00:00Z')), true);
  // 08:00Z = 15:00 WIB (after 14:00 cutoff).
  assert.equal(isBeforeCutoff(new Date('2026-01-05T08:00:00Z')), false);
});

test('a weekend order is always treated as after cutoff', () => {
  // 2026-01-03 is a Saturday.
  assert.equal(isBeforeCutoff(new Date('2026-01-03T02:00:00Z')), false);
});

test('Jabodetabek before-cutoff dispatch commitment never promises an arrival date', () => {
  const commitment = computeDispatchCommitment(new Date('2026-01-05T06:00:00Z'), 'JABODETABEK');
  assert.equal(commitment.beforeCutoff, true);
  assert.doesNotMatch(commitment.dispatchText, /tiba/i);
  assert.match(commitment.dispatchText, /dikirim/i);
});

test('outside-Jabodetabek after-cutoff dispatch commitment uses "diserahkan ke mitra logistik" wording, distinct from Jabodetabek', () => {
  const commitment = computeDispatchCommitment(new Date('2026-01-05T08:00:00Z'), 'OUTSIDE_JABODETABEK');
  assert.equal(commitment.beforeCutoff, false);
  assert.match(commitment.dispatchText, /mitra logistik/i);
});

test('Test 86 — a clear Java destination is deterministically eligible for free shipping', () => {
  assert.equal(checkJavaEligibility('Jl. Sudirman, Surabaya'), 'JAVA');
  assert.equal(checkJavaEligibility('Bandung, Jawa Barat'), 'JAVA');
});

test('a clear non-Java destination is never treated as Java-eligible', () => {
  assert.equal(checkJavaEligibility('Jl. Merdeka, Medan, Sumatera Utara'), 'NOT_JAVA');
});

test('an ambiguous or missing destination is UNKNOWN, never guessed', () => {
  assert.equal(checkJavaEligibility(''), 'UNKNOWN');
  assert.equal(checkJavaEligibility('Jl. Mawar No. 5'), 'UNKNOWN');
});

test('the approved free-shipping text is used verbatim', () => {
  assert.equal(FREE_SHIPPING_JAVA_TEXT, 'Gratis ongkir dan peti kayu ke seluruh wilayah Jawa tanpa minimum pembelian.');
});
