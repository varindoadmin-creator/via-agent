import test from 'node:test';
import assert from 'node:assert/strict';
import { findDuplicateGroups, type DuplicateCandidate } from './duplicates.ts';

const customer = (id: string, status: string): DuplicateCandidate => ({
  contact_id: id, contact_name: 'SAME CUSTOMER, PT', company_name: '', email: '', phone: '', mobile: '',
  npwp: '1234567890123456', status,
});

test('inactive contacts left behind by Zoho merge are excluded', () => {
  assert.deepEqual(findDuplicateGroups([customer('master', 'active'), customer('absorbed', 'inactive')]), []);
});

test('two active matching contacts remain actionable duplicates', () => {
  const groups = findDuplicateGroups([customer('one', 'active'), customer('two', 'active')]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].customers.map(item => item.contact_id).sort(), ['one', 'two']);
});
