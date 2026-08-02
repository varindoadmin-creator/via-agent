import test from 'node:test';
import assert from 'node:assert/strict';
import { duplicateGroupFingerprint } from './ignoreStore.ts';

test('duplicate group fingerprint is stable regardless of selection order', () => {
  assert.equal(duplicateGroupFingerprint(['customer-b', 'customer-a']), 'customer-a:customer-b');
  assert.equal(duplicateGroupFingerprint(['customer-a', 'customer-b', 'customer-a']), 'customer-a:customer-b');
});

test('duplicate group fingerprint rejects empty values', () => {
  assert.equal(duplicateGroupFingerprint(['', 'customer-a']), 'customer-a');
});
