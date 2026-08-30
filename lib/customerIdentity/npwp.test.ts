import assert from 'node:assert/strict';
import test from 'node:test';
import { validateNpwp, formatNpwp } from './npwp.ts';

test('a correctly formatted 15-digit NPWP validates', () => {
  const result = validateNpwp('01.234.567.8-901.000');
  assert.equal(result.valid, true);
  assert.equal(result.normalized, '012345678901000');
});

test('a bare 15-digit NPWP validates', () => {
  const result = validateNpwp('012345678901000');
  assert.equal(result.valid, true);
});

test('a 16-digit NIK-based NPWP validates', () => {
  const result = validateNpwp('0123456789010001');
  assert.equal(result.valid, true);
});

test('empty/missing NPWP is invalid, never inferred', () => {
  assert.equal(validateNpwp(null).valid, false);
  assert.equal(validateNpwp('').valid, false);
});

test('wrong digit count is invalid', () => {
  assert.equal(validateNpwp('123').valid, false);
  assert.equal(validateNpwp('1234567890123456789').valid, false);
});

test('formatNpwp reproduces the standard dotted format for 15 digits', () => {
  assert.equal(formatNpwp('012345678901000'), '01.234.567.8-901.000');
});
