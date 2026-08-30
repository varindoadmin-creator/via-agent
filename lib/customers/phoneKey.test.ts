import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePhoneKey } from './phoneKey.ts';

test('absorbs 0/62/+62 country-code prefix differences via last-9-digits key', () => {
  assert.equal(normalizePhoneKey('081234567890'), '234567890');
  assert.equal(normalizePhoneKey('+6281234567890'), '234567890');
  assert.equal(normalizePhoneKey('6281234567890'), '234567890');
});

test('rejects values too short to be a real phone number', () => {
  assert.equal(normalizePhoneKey('12345'), null);
  assert.equal(normalizePhoneKey(null), null);
  assert.equal(normalizePhoneKey(undefined), null);
});
