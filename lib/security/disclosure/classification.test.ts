import assert from 'node:assert/strict';
import test from 'node:test';
import { classificationForCategory, POLICY_MATRIX } from './classification.ts';

test('brief section 13 policy matrix: key categories map to the expected classification', () => {
  assert.equal(classificationForCategory('PRODUCT_INFO'), 'PUBLIC');
  assert.equal(classificationForCategory('APPROVED_PRICE'), 'CUSTOMER_SHAREABLE');
  assert.equal(classificationForCategory('CUSTOMER_SAFE_STOCK'), 'CUSTOMER_SHAREABLE');
  assert.equal(classificationForCategory('EXACT_STOCK'), 'CONFIDENTIAL');
  assert.equal(classificationForCategory('SUPPLIER_COST'), 'CONFIDENTIAL');
  assert.equal(classificationForCategory('MARGIN'), 'CONFIDENTIAL');
  assert.equal(classificationForCategory('BRAND_SALES'), 'INTERNAL');
  assert.equal(classificationForCategory('COMPANY_SALES'), 'INTERNAL');
  assert.equal(classificationForCategory('OWN_ORDER_STATUS'), 'CUSTOMER_SCOPED');
  assert.equal(classificationForCategory('OTHER_CUSTOMER_DATA'), 'RESTRICTED');
  assert.equal(classificationForCategory('CREDENTIALS'), 'RESTRICTED');
});

test('an unregistered category fails closed to the most sensitive tier, never PUBLIC', () => {
  // @ts-expect-error deliberately testing an out-of-registry value
  assert.equal(classificationForCategory('SOMETHING_NOT_REGISTERED'), 'RESTRICTED');
});

test('every matrix entry has a category present exactly once', () => {
  const categories = POLICY_MATRIX.map(e => e.category);
  assert.equal(new Set(categories).size, categories.length);
});
