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

test('Phase 7 audit correction — a MATCHED Phase 2 phone-only resolution (no Phase 6 mapping) now yields the weaker PHONE_MATCHED level, still with the resolved customerId for read-only product/price lookups', () => {
  const matched = externalWatiAudience({
    customerResolution: { status: 'MATCHED', customer: { contact_id: 'CUST-1', contact_name: 'PT ABC', status: 'active', contact_type: 'customer' } },
    externalPhone: '628123',
    conversationId: '628123',
  });
  assert.equal(matched.identityLevel, 'PHONE_MATCHED');
  assert.equal(matched.customerId, 'CUST-1');
});

test('Test 65/70 — a resolved Phase 6 UNVERIFIED mapping yields CUSTOMER_MATCHED', () => {
  const matched = externalWatiAudience({
    customerResolution: { status: 'UNMATCHED', customer: null },
    externalPhone: '628123',
    conversationId: '628123',
    channelIdentity: { customerId: 'CUST-1', relationshipStatus: 'UNVERIFIED' },
  });
  assert.equal(matched.identityLevel, 'CUSTOMER_MATCHED');
  assert.equal(matched.customerId, 'CUST-1');
});

test('a resolved Phase 6 VERIFIED mapping yields VERIFIED_CUSTOMER, clearing the bar for invoice documents', () => {
  const matched = externalWatiAudience({
    customerResolution: { status: 'UNMATCHED', customer: null },
    externalPhone: '628123',
    conversationId: '628123',
    channelIdentity: { customerId: 'CUST-1', relationshipStatus: 'VERIFIED' },
  });
  assert.equal(matched.identityLevel, 'VERIFIED_CUSTOMER');
});

test('a Phase 6 mapping takes priority over a Phase 2 phone match when both exist', () => {
  const matched = externalWatiAudience({
    customerResolution: { status: 'MATCHED', customer: { contact_id: 'CUST-OLD', contact_name: 'Old Match', status: 'active', contact_type: 'customer' } },
    externalPhone: '628123',
    conversationId: '628123',
    channelIdentity: { customerId: 'CUST-NEW', relationshipStatus: 'VERIFIED' },
  });
  assert.equal(matched.customerId, 'CUST-NEW');
  assert.equal(matched.identityLevel, 'VERIFIED_CUSTOMER');
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
