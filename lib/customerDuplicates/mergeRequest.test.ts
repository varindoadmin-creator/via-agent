import test from 'node:test';
import assert from 'node:assert/strict';
import { buildZohoContactMergePath } from './mergeRequest.ts';

test('merge path retains the selected contact and sends only duplicate IDs', () => {
  assert.equal(
    buildZohoContactMergePath('keep-2', ['remove-3', 'keep-2', 'remove-1']),
    '/contacts/keep-2/merge?contact_ids=remove-1%2Cremove-3',
  );
});

test('merge path rejects a group without another contact', () => {
  assert.throws(() => buildZohoContactMergePath('keep-1', ['keep-1']), /duplicate contact/);
});
