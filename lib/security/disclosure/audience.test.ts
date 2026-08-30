import assert from 'node:assert/strict';
import test from 'node:test';
import { externalWatiAudience, internalAudience, systemAudience } from './audience.ts';

test('externalWatiAudience is always EXTERNAL_CUSTOMER/WATI regardless of resolution status', () => {
  const unmatched = externalWatiAudience({ customerResolution: { status: 'UNMATCHED', customer: null }, externalPhone: '628123', conversationId: '628123' });
  assert.equal(unmatched.actorType, 'EXTERNAL_CUSTOMER');
  assert.equal(unmatched.channel, 'WATI');
  assert.equal(unmatched.identityLevel, 'ANONYMOUS');
  assert.equal(unmatched.customerId, undefined);
});

test('a MATCHED customer resolution yields CUSTOMER_MATCHED identity level and the resolved customerId', () => {
  const matched = externalWatiAudience({
    customerResolution: { status: 'MATCHED', customer: { contact_id: 'CUST-1', contact_name: 'PT ABC', status: 'active', contact_type: 'customer' } },
    externalPhone: '628123',
    conversationId: '628123',
  });
  assert.equal(matched.identityLevel, 'CUSTOMER_MATCHED');
  assert.equal(matched.customerId, 'CUST-1');
});

test('AMBIGUOUS resolution never grants a customerId or elevated identity level — never guesses which customer', () => {
  const ambiguous = externalWatiAudience({ customerResolution: { status: 'AMBIGUOUS', customer: null }, externalPhone: '628123', conversationId: '628123' });
  assert.equal(ambiguous.customerId, undefined);
  assert.equal(ambiguous.identityLevel, 'ANONYMOUS');
});

test('internalAudience is always INTERNAL_USER/VIA, never derived from any external input', () => {
  const audience = internalAudience('director', 'authenticated:director');
  assert.equal(audience.actorType, 'INTERNAL_USER');
  assert.equal(audience.channel, 'VIA');
  assert.equal(audience.identityLevel, 'INTERNAL_AUTHENTICATED');
});

test('systemAudience is its own distinct actor type', () => {
  assert.equal(systemAudience().actorType, 'SYSTEM');
});
