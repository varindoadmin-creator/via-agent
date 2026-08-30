import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveDeliveryAddress, matchAddressFreeText, addressBelongsToCustomer } from './addressResolution.ts';
import type { ZohoAddress } from '../../../../types/zoho.ts';

const GUDANG_JAKARTA: ZohoAddress = { address_id: 'A1', attention: 'Gudang Jakarta', address: 'Jl. A No 1', city: 'Jakarta', state: '', zip: '', country: 'Indonesia' };
const GUDANG_TANGERANG: ZohoAddress = { address_id: 'A2', attention: 'Gudang Tangerang', address: 'Jl. B No 2', city: 'Tangerang', state: '', zip: '', country: 'Indonesia' };
const PROYEK_BSD: ZohoAddress = { address_id: 'A3', attention: 'Proyek BSD', address: 'Jl. C No 3', city: 'BSD', state: '', zip: '', country: 'Indonesia' };

test('Test 74 — zero addresses asks the customer for one, never auto-adds to Zoho master data', () => {
  const result = resolveDeliveryAddress([]);
  assert.equal(result.status, 'NONE');
});

test('Test 74/24 — exactly one address auto-selects without asking', () => {
  const result = resolveDeliveryAddress([GUDANG_TANGERANG]);
  assert.equal(result.status, 'AUTO_SELECTED');
  if (result.status === 'AUTO_SELECTED') assert.equal(result.address.address_id, 'A2');
});

test('Test 74/25 — multiple addresses always asks, never inferred by recency/frequency', () => {
  const result = resolveDeliveryAddress([GUDANG_JAKARTA, GUDANG_TANGERANG, PROYEK_BSD]);
  assert.equal(result.status, 'ASK');
  if (result.status === 'ASK') assert.equal(result.candidates.length, 3);
});

test('Test 30 — "Kirim ke proyek BSD" matches exactly one of the customer\'s own addresses', () => {
  const result = matchAddressFreeText('Kirim ke proyek BSD', [GUDANG_JAKARTA, GUDANG_TANGERANG, PROYEK_BSD]);
  assert.equal(result.outcome, 'EXACT');
  if (result.outcome === 'EXACT') assert.equal(result.address.address_id, 'A3');
});

test('Test 30 — an address that does not belong to this customer is NOT_FOUND, not invented', () => {
  const result = matchAddressFreeText('Kirim ke proyek BSD', [GUDANG_JAKARTA, GUDANG_TANGERANG]);
  assert.equal(result.outcome, 'NOT_FOUND');
});

test('Test 64/79 — addressBelongsToCustomer rejects an address ID scoped to a different customer\'s address list', () => {
  assert.equal(addressBelongsToCustomer('A3', [GUDANG_JAKARTA, GUDANG_TANGERANG]), false);
  assert.equal(addressBelongsToCustomer('A1', [GUDANG_JAKARTA, GUDANG_TANGERANG]), true);
});
