import assert from 'node:assert/strict';
import test from 'node:test';
import { responseForReasonCode } from './responses.ts';

test('every denial reason code maps to a natural Bahasa message, never a technical error string', () => {
  const text = responseForReasonCode('INTERNAL_DATA_EXTERNAL_DENIED');
  assert.doesNotMatch(text, /403|error|denied by|access control/i);
  assert.match(text, /Mohon maaf/);
});

test('cross-customer and restricted denials share the same customer-facing text (brief section 32)', () => {
  assert.equal(responseForReasonCode('CROSS_CUSTOMER_ACCESS_DENIED'), responseForReasonCode('RESTRICTED_DATA_DENIED'));
});

test('a policy failure never surfaces a technical message, falling back to the safest generic denial', () => {
  const text = responseForReasonCode('POLICY_EVALUATION_FAILED');
  assert.doesNotMatch(text, /error|exception|failed/i);
});

test('ALLOW-shaped reason codes produce no denial text (caller uses the real response instead)', () => {
  assert.equal(responseForReasonCode('PUBLIC_DATA_ALLOWED'), '');
  assert.equal(responseForReasonCode('CUSTOMER_SHAREABLE_ALLOWED'), '');
  assert.equal(responseForReasonCode('CUSTOMER_OWNED_RESOURCE_ALLOWED'), '');
});
