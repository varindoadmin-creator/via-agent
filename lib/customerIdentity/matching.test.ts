import assert from 'node:assert/strict';
import test from 'node:test';
import { matchExistingCustomer, normalizeCompanyName } from './matching.ts';
import type { ZohoContact } from '../../types/zoho.ts';

const CUSTOMERS: ZohoContact[] = [
  { contact_id: 'C1', contact_name: 'PT ABC', company_name: 'PT ABC', phone: '628123456789', email: 'a@abc.co.id', status: 'active', contact_type: 'customer' },
  { contact_id: 'C2', contact_name: 'CV ABC INTERIOR', company_name: 'CV ABC INTERIOR', phone: '628199999999', status: 'active', contact_type: 'customer' },
  { contact_id: 'C3', contact_name: 'PT UNRELATED JAYA', company_name: 'PT UNRELATED JAYA', cf_npwp: '01.234.567.8-901.000', status: 'active', contact_type: 'customer' },
];

test('Test 70c — an exact phone match resolves to EXACT_MATCH, no duplicate creation', () => {
  const result = matchExistingCustomer({ phone: '628123456789' }, CUSTOMERS);
  assert.equal(result.outcome, 'EXACT_MATCH');
  assert.equal(result.candidates[0].contact_id, 'C1');
});

test('an exact NPWP match resolves to EXACT_MATCH', () => {
  const result = matchExistingCustomer({ npwp: '012345678901000' }, CUSTOMERS);
  assert.equal(result.outcome, 'EXACT_MATCH');
  assert.equal(result.candidates[0].contact_id, 'C3');
});

test('an exact normalized company-name match resolves to EXACT_MATCH', () => {
  const result = matchExistingCustomer({ companyName: 'PT ABC' }, CUSTOMERS);
  assert.equal(result.outcome, 'EXACT_MATCH');
  assert.equal(result.candidates[0].contact_id, 'C1');
});

test('Test 70e — a bare fuzzy name-only overlap is only ever POSSIBLE_MATCH, never promoted to exact', () => {
  const result = matchExistingCustomer({ companyName: 'ABC INTERIOR JAYA' }, CUSTOMERS);
  assert.equal(result.outcome, 'POSSIBLE_MATCH');
  assert.ok(result.candidates.length >= 1);
});

test('no matching signal at all resolves to NO_MATCH -> start onboarding', () => {
  const result = matchExistingCustomer({ phone: '628000000000', companyName: 'PT BARU SEKALI' }, CUSTOMERS);
  assert.equal(result.outcome, 'NO_MATCH');
  assert.equal(result.candidates.length, 0);
});

test('normalizeCompanyName strips legal-entity prefixes so "PT ABC" and "ABC" compare equal', () => {
  assert.equal(normalizeCompanyName('PT ABC'), normalizeCompanyName('ABC'));
});
