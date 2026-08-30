// ─── Customer phone resolution ────────────────────────────────────────────────
// WhatsApp-number → Zoho-customer resolution for the WATI inbound pipeline.
// Kept separate from phoneKey.ts (which lib/customerCleanup/duplicates.ts also
// uses) specifically so that pure, dependency-free consumer never transitively
// pulls in Zoho's customers module — see phoneKey.ts's module comment.

import { getAllCustomers } from '../zoho/customers.ts';
import type { ZohoContact } from '../../types/zoho.ts';
import { normalizePhoneKey } from './phoneKey.ts';

export { normalizePhoneKey };

export type CustomerResolutionStatus = 'MATCHED' | 'UNMATCHED' | 'AMBIGUOUS';

export interface CustomerResolutionResult {
  status: CustomerResolutionStatus;
  customer: ZohoContact | null;
  candidates: ZohoContact[];
}

/**
 * Resolve an inbound WhatsApp number against Zoho customers by phone/mobile.
 * Never guesses: multiple active customers sharing the same last-9-digits key
 * come back AMBIGUOUS rather than picking one.
 *
 * `getAllCustomers()` hits Zoho's list-contacts endpoint (cached), which the
 * app's ZohoContact type only declares `phone` for. Zoho's actual JSON may or
 * may not include `mobile` on the list response (customerCleanup/duplicates.ts
 * only trusted `mobile` from the heavier per-contact detail endpoint). Reading
 * it here optimistically off the raw object degrades gracefully to phone-only
 * matching if the list response omits it — no crash, just a narrower match.
 */
export async function resolveCustomerByPhone(rawPhone: string): Promise<CustomerResolutionResult> {
  const key = normalizePhoneKey(rawPhone);
  if (!key) return { status: 'UNMATCHED', customer: null, candidates: [] };

  const customers = await getAllCustomers();
  const matches = customers.filter(c => {
    const contact = c as unknown as { phone?: string; mobile?: string; status?: string };
    if (contact.status && contact.status.toLowerCase() !== 'active') return false;
    return normalizePhoneKey(contact.phone) === key || normalizePhoneKey(contact.mobile) === key;
  });

  if (matches.length === 0) return { status: 'UNMATCHED', customer: null, candidates: [] };
  if (matches.length === 1) return { status: 'MATCHED', customer: matches[0], candidates: matches };
  return { status: 'AMBIGUOUS', customer: null, candidates: matches };
}
