import assert from 'node:assert/strict';
import test from 'node:test';
import { processOnboardingReply } from './onboarding.ts';
import type { CustomerDraft } from './customerDraft.ts';

function draft(overrides: Partial<CustomerDraft>): CustomerDraft {
  return {
    id: 'd1', organization_id: 'varindo', source: 'WATI', normalized_phone: '234567890',
    wati_contact_id: null, conversation_id: null, company_name: null, contact_person_name: null,
    email: null, needs_faktur_pajak: null, npwp: null, billing_address: null, shipping_address: null,
    duplicate_check_status: null, duplicate_candidate_customer_ids: null, status: 'COLLECTING_COMPANY',
    created_customer_id: null, version: 1, created_at: '', updated_at: '',
    ...overrides,
  };
}

test('Test 71 — needs Faktur Pajak = NO: NPWP is never requested', () => {
  const afterCompany = processOnboardingReply(draft({ status: 'COLLECTING_COMPANY' }), 'PT Contoh Jaya');
  assert.equal(afterCompany.nextStatus, 'COLLECTING_TAX_REQUIREMENT');
  assert.equal(afterCompany.patch.company_name, 'PT Contoh Jaya');

  const afterTax = processOnboardingReply(draft({ status: 'COLLECTING_TAX_REQUIREMENT' }), 'Tidak');
  assert.equal(afterTax.nextStatus, 'COLLECTING_BILLING_ADDRESS');
  assert.equal(afterTax.patch.needs_faktur_pajak, false);
  assert.equal(afterTax.patch.npwp, undefined);
});

test('Test 71 — needs Faktur Pajak = YES: NPWP is requested and validated', () => {
  const afterTax = processOnboardingReply(draft({ status: 'COLLECTING_TAX_REQUIREMENT' }), 'Ya');
  assert.equal(afterTax.nextStatus, 'COLLECTING_NPWP');
  assert.match(afterTax.question ?? '', /NPWP/);

  const invalidNpwp = processOnboardingReply(draft({ status: 'COLLECTING_NPWP' }), '123');
  assert.equal(invalidNpwp.nextStatus, 'COLLECTING_NPWP');
  assert.match(invalidNpwp.question ?? '', /belum sesuai/);

  const validNpwp = processOnboardingReply(draft({ status: 'COLLECTING_NPWP' }), '01.234.567.8-901.000');
  assert.equal(validNpwp.nextStatus, 'COLLECTING_BILLING_ADDRESS');
  assert.equal(validNpwp.patch.npwp, '012345678901000');
});

test('Test 71 — incomplete/empty address re-asks instead of guessing', () => {
  const result = processOnboardingReply(draft({ status: 'COLLECTING_BILLING_ADDRESS' }), '   ');
  assert.equal(result.nextStatus, 'COLLECTING_BILLING_ADDRESS');
  assert.equal(result.done, false);
});

test('shipping same as billing copies the validated billing address, no re-collection', () => {
  const billing = { address: 'Jl. Sudirman No. 1' };
  const result = processOnboardingReply(draft({ status: 'COLLECTING_SHIPPING_ADDRESS', billing_address: billing }), 'Sama');
  assert.equal(result.done, true);
  assert.deepEqual(result.patch.shipping_address, billing);
});

test('shipping different from billing collects a separate address over two turns', () => {
  const askAddress = processOnboardingReply(draft({ status: 'COLLECTING_SHIPPING_ADDRESS' }), 'Tidak');
  assert.equal(askAddress.nextStatus, 'COLLECTING_SHIPPING_ADDRESS');
  assert.equal(askAddress.done, false);

  const withAddress = processOnboardingReply(draft({ status: 'COLLECTING_SHIPPING_ADDRESS' }), 'Jl. Gudang No. 5, Tangerang');
  assert.equal(withAddress.done, true);
  assert.deepEqual(withAddress.patch.shipping_address, { address: 'Jl. Gudang No. 5, Tangerang' });
});
