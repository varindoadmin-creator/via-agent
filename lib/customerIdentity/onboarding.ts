// ─── New Customer Onboarding conversation flow ───────────────────────────────
// Brief sections 6-7: one question at a time, sequential, never a giant form.
// Pure function — no I/O — so it's fully deterministic and testable: given the
// current draft and the customer's latest reply, decide what field to store
// and what to ask next. The caller persists the resulting patch via
// updateCustomerDraft and sends `question` verbatim as the outbound reply.
//
// Company -> needs Faktur Pajak? -> [NPWP if yes] -> Billing Address ->
// same-as-billing? -> [Shipping Address if no] -> done (caller runs the
// duplicate check and decides POSSIBLE_DUPLICATE vs READY_FOR_REVIEW).

import type { CustomerDraft, CustomerDraftStatus, AddressDraft } from './customerDraft.ts';
import { validateNpwp } from './npwp.ts';

export interface OnboardingStep {
  nextStatus: CustomerDraftStatus;
  question: string | null; // null only when done — caller proceeds to duplicate check
  patch: Partial<Pick<CustomerDraft, 'company_name' | 'needs_faktur_pajak' | 'npwp' | 'billing_address' | 'shipping_address'>>;
  done: boolean;
}

const ASK_COMPANY = 'Baik Pak/Bu, karena data perusahaan belum terdaftar, kami bantu daftarkan terlebih dahulu.\n\nBoleh diinformasikan nama perusahaan?';
const ASK_FAKTUR_PAJAK = 'Apakah Bapak/Ibu memerlukan Faktur Pajak?';
const ASK_NPWP = 'Baik Pak/Bu, mohon diinformasikan NPWP perusahaan.';
const ASK_NPWP_INVALID = 'Mohon maaf, format NPWP belum sesuai (15-16 digit). Mohon diinformasikan kembali NPWP perusahaan.';
const ASK_BILLING_ADDRESS = 'Mohon diinformasikan alamat kantor untuk alamat penagihan.';
const ASK_SHIPPING_SAME = 'Untuk alamat pengiriman, apakah sama dengan alamat kantor?';
const ASK_SHIPPING_ADDRESS = 'Baik Pak/Bu, mohon diinformasikan alamat pengiriman.';

export function startOnboardingQuestion(): string {
  return ASK_COMPANY;
}

/** null = the text wasn't recognizably yes/no — caller may treat it as the next answer instead. */
function parseYesNo(text: string): boolean | null {
  const t = text.trim().toLowerCase();
  if (/^(ya|iya|yes|benar|betul|sama|oke|ok)\b/.test(t)) return true;
  if (/^(tidak|gak|ga|nggak|no|beda|berbeda)\b/.test(t)) return false;
  return null;
}

export function processOnboardingReply(draft: CustomerDraft, inboundText: string): OnboardingStep {
  const text = inboundText.trim();

  switch (draft.status) {
    case 'COLLECTING_COMPANY': {
      if (!text) return { nextStatus: 'COLLECTING_COMPANY', question: ASK_COMPANY, patch: {}, done: false };
      return { nextStatus: 'COLLECTING_TAX_REQUIREMENT', question: ASK_FAKTUR_PAJAK, patch: { company_name: text }, done: false };
    }

    case 'COLLECTING_TAX_REQUIREMENT': {
      const answer = parseYesNo(text);
      if (answer === null) return { nextStatus: 'COLLECTING_TAX_REQUIREMENT', question: ASK_FAKTUR_PAJAK, patch: {}, done: false };
      if (answer) return { nextStatus: 'COLLECTING_NPWP', question: ASK_NPWP, patch: { needs_faktur_pajak: true }, done: false };
      // NPWP not required — brief section 8: never force NPWP when Faktur Pajak isn't needed.
      return { nextStatus: 'COLLECTING_BILLING_ADDRESS', question: ASK_BILLING_ADDRESS, patch: { needs_faktur_pajak: false }, done: false };
    }

    case 'COLLECTING_NPWP': {
      const result = validateNpwp(text);
      if (!result.valid) return { nextStatus: 'COLLECTING_NPWP', question: ASK_NPWP_INVALID, patch: {}, done: false };
      return { nextStatus: 'COLLECTING_BILLING_ADDRESS', question: ASK_BILLING_ADDRESS, patch: { npwp: result.normalized }, done: false };
    }

    case 'COLLECTING_BILLING_ADDRESS': {
      if (!text) return { nextStatus: 'COLLECTING_BILLING_ADDRESS', question: ASK_BILLING_ADDRESS, patch: {}, done: false };
      const billingAddress: AddressDraft = { address: text };
      return { nextStatus: 'COLLECTING_SHIPPING_ADDRESS', question: ASK_SHIPPING_SAME, patch: { billing_address: billingAddress }, done: false };
    }

    case 'COLLECTING_SHIPPING_ADDRESS': {
      // Two sub-turns share one status: first the yes/no "same as billing?",
      // then (only if "no") the actual address text. Distinguished by whether
      // shipping_address is already pending capture (billing_address set,
      // shipping_address still null) combined with whether this reply parses
      // as yes/no at all.
      const answer = parseYesNo(text);
      if (answer === true) {
        return { nextStatus: 'READY_FOR_REVIEW', question: null, patch: { shipping_address: draft.billing_address }, done: true };
      }
      if (answer === false) {
        return { nextStatus: 'COLLECTING_SHIPPING_ADDRESS', question: ASK_SHIPPING_ADDRESS, patch: {}, done: false };
      }
      // Not yes/no — the customer already said "no" last turn and this is the address itself.
      if (!text) return { nextStatus: 'COLLECTING_SHIPPING_ADDRESS', question: ASK_SHIPPING_ADDRESS, patch: {}, done: false };
      const shippingAddress: AddressDraft = { address: text };
      return { nextStatus: 'READY_FOR_REVIEW', question: null, patch: { shipping_address: shippingAddress }, done: true };
    }

    default:
      return { nextStatus: draft.status, question: null, patch: {}, done: true };
  }
}
