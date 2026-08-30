import assert from 'node:assert/strict';
import test from 'node:test';
import { computeDraftHash, isApprovalStillValid } from './approval.ts';

test('computeDraftHash is stable for the same content regardless of key order', () => {
  const a = computeDraftHash({ company_name: 'PT ABC', npwp: '123' });
  const b = computeDraftHash({ npwp: '123', company_name: 'PT ABC' });
  assert.equal(a, b);
});

test('computeDraftHash changes when material content changes', () => {
  const a = computeDraftHash({ company_name: 'PT ABC' });
  const b = computeDraftHash({ company_name: 'PT ABC Baru' });
  assert.notEqual(a, b);
});

test('Test 78 — an approval bound to an old version/hash is invalid after a draft edit increments version', () => {
  const hash = computeDraftHash({ company_name: 'PT ABC' });
  const stillValid = isApprovalStillValid({ approvedVersion: 1, approvedHash: hash, currentVersion: 2, currentMaterialFields: { company_name: 'PT ABC' } });
  assert.equal(stillValid, false);
});

test('an approval matching the exact current version and content is valid', () => {
  const fields = { company_name: 'PT ABC' };
  const hash = computeDraftHash(fields);
  const valid = isApprovalStillValid({ approvedVersion: 1, approvedHash: hash, currentVersion: 1, currentMaterialFields: fields });
  assert.equal(valid, true);
});
