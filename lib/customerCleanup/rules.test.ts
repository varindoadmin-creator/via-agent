import assert from 'node:assert/strict';
import test from 'node:test';
import { computeCustomerFix, formatBusinessName, TARGET_ACCOUNT_ID, TARGET_TAX_ID } from './rules.ts';

test('replaces a period before a legal company suffix with a comma', () => {
  assert.equal(formatBusinessName('LOGAM MAS. PT'), 'LOGAM MAS, PT');
  assert.equal(formatBusinessName('Maju Bersama . cv'), 'MAJU BERSAMA, CV');
  assert.equal(formatBusinessName('Sentosa, P.T.'), 'SENTOSA, PT');
});

test('does not replace ordinary periods that are not before a legal suffix', () => {
  assert.equal(formatBusinessName('TOKO MAS. JAYA'), 'TOKO MAS. JAYA');
});

test('customer repair proposes both company and display name corrections', () => {
  const fix = computeCustomerFix({
    contact_id: 'contact-1',
    customer_sub_type: 'business',
    company_name: 'LOGAM MAS. PT',
    contact_name: 'LOGAM MAS. PT',
    tax_id: TARGET_TAX_ID,
    account_id: TARGET_ACCOUNT_ID,
    payment_terms: 0,
    custom_field_hash: { cf_region: 'HEAD OFFICE' },
  });

  assert.deepEqual(fix.changes.filter(change => change.field.includes('Name')), [
    { field: 'Company Name', from: 'LOGAM MAS. PT', to: 'LOGAM MAS, PT' },
    { field: 'Display Name', from: 'LOGAM MAS. PT', to: 'LOGAM MAS, PT' },
  ]);
  assert.equal(fix.payload.company_name, 'LOGAM MAS, PT');
  assert.equal(fix.payload.contact_name, 'LOGAM MAS, PT');
});
