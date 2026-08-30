import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateDisclosure } from './policy.ts';
import { internalAudience, type AudienceContext } from './audience.ts';

function external(overrides: Partial<AudienceContext> = {}): AudienceContext {
  return { organizationId: 'varindo', actorType: 'EXTERNAL_CUSTOMER', channel: 'WATI', identityLevel: 'ANONYMOUS', ...overrides };
}

test('Test 1 — internal audience is governed elsewhere (not denied by this service), matching brief section 12', () => {
  const result = evaluateDisclosure({ audience: internalAudience('director'), category: 'BRAND_SALES' });
  assert.equal(result.decision, 'ALLOW');
  assert.equal(result.reasonCode, 'INTERNAL_USER_GOVERNED_ELSEWHERE');
});

test('Test 2 — external brand/company sales: DENY, INTERNAL classification', () => {
  const result = evaluateDisclosure({ audience: external(), category: 'BRAND_SALES' });
  assert.equal(result.decision, 'DENY');
  assert.equal(result.reasonCode, 'INTERNAL_DATA_EXTERNAL_DENIED');
});

test('Test 4 — margin: DENY, CONFIDENTIAL classification', () => {
  const result = evaluateDisclosure({ audience: external(), category: 'MARGIN' });
  assert.equal(result.decision, 'DENY');
  assert.equal(result.reasonCode, 'CONFIDENTIAL_DATA_EXTERNAL_DENIED');
});

test('Test 5 — supplier cost: DENY, CONFIDENTIAL classification', () => {
  const result = evaluateDisclosure({ audience: external(), category: 'SUPPLIER_COST' });
  assert.equal(result.decision, 'DENY');
  assert.equal(result.reasonCode, 'CONFIDENTIAL_DATA_EXTERNAL_DENIED');
});

test('Test 6 — matched customer asking about their OWN order: ALLOW once ownership matches', () => {
  const result = evaluateDisclosure({ audience: external({ customerId: 'CUST-1', identityLevel: 'CUSTOMER_MATCHED' }), category: 'OWN_ORDER_STATUS', ownerCustomerId: 'CUST-1' });
  assert.equal(result.decision, 'ALLOW');
  assert.equal(result.reasonCode, 'CUSTOMER_OWNED_RESOURCE_ALLOWED');
});

test('Test 7 — requesting customer does not own the resource: DENY, cross-customer', () => {
  const result = evaluateDisclosure({ audience: external({ customerId: 'CUST-XYZ', identityLevel: 'CUSTOMER_MATCHED' }), category: 'OWN_ORDER_STATUS', ownerCustomerId: 'CUST-ABC' });
  assert.equal(result.decision, 'DENY');
  assert.equal(result.reasonCode, 'CROSS_CUSTOMER_ACCESS_DENIED');
});

test('an unmatched customer asking about a CUSTOMER_SCOPED resource must verify identity, never silently ALLOW', () => {
  const result = evaluateDisclosure({ audience: external(), category: 'OWN_ORDER_STATUS', ownerCustomerId: 'CUST-ABC' });
  assert.equal(result.decision, 'VERIFY_IDENTITY');
  assert.equal(result.reasonCode, 'CUSTOMER_IDENTITY_REQUIRED');
});

test('Test 8 — other customer sales/data: DENY, RESTRICTED classification', () => {
  const result = evaluateDisclosure({ audience: external(), category: 'OTHER_CUSTOMER_DATA' });
  assert.equal(result.decision, 'DENY');
  assert.equal(result.reasonCode, 'RESTRICTED_DATA_DENIED');
});

test('Test 13 — public product info: ALLOW for anonymous external customers', () => {
  const result = evaluateDisclosure({ audience: external(), category: 'PRODUCT_INFO' });
  assert.equal(result.decision, 'ALLOW');
  assert.equal(result.reasonCode, 'PUBLIC_DATA_ALLOWED');
});

test('Test 14 — approved price is customer-shareable: ALLOW', () => {
  const result = evaluateDisclosure({ audience: external(), category: 'APPROVED_PRICE' });
  assert.equal(result.decision, 'ALLOW');
});

test('an unregistered category defaults to the most sensitive classification, denying rather than allowing', () => {
  // @ts-expect-error deliberately testing an out-of-registry category
  const result = evaluateDisclosure({ audience: external(), category: 'SOMETHING_NOT_REGISTERED' });
  assert.equal(result.decision, 'DENY');
  assert.equal(result.reasonCode, 'RESTRICTED_DATA_DENIED');
});

test('Test 15 — a genuinely malformed audience (null) fails closed to a DENY decision object, never an uncaught exception', () => {
  // @ts-expect-error deliberately null to force a runtime TypeError inside evaluateDisclosure
  const result = evaluateDisclosure({ audience: null, category: 'OWN_ORDER_STATUS', ownerCustomerId: 'X' });
  assert.equal(result.decision, 'DENY');
  assert.equal(result.reasonCode, 'POLICY_EVALUATION_FAILED');
});

test('credentials/secrets are always RESTRICTED and denied externally', () => {
  const result = evaluateDisclosure({ audience: external(), category: 'CREDENTIALS' });
  assert.equal(result.decision, 'DENY');
  assert.equal(result.reasonCode, 'RESTRICTED_DATA_DENIED');
});
