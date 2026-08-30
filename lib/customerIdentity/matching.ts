// ─── Existing-customer matching ──────────────────────────────────────────────
// Brief sections 5C/10: on an unknown phone, search existing VIA/Zoho customer
// records using safe deterministic matching (phone, company name, NPWP,
// email) — never fuzzy name similarity alone (section 10's explicit rule).
// Used both to link an unknown phone to an existing customer (section 5C) and
// to prevent duplicate Zoho customer creation before onboarding writes
// anything (section 10).

import type { ZohoContact } from '../../types/zoho.ts';
import { normalizePhoneKey } from '../customers/phoneKey.ts';

export type MatchOutcome = 'EXACT_MATCH' | 'POSSIBLE_MATCH' | 'NO_MATCH';

export interface MatchResult {
  outcome: MatchOutcome;
  candidates: ZohoContact[];
}

export function normalizeCompanyName(name: string | null | undefined): string {
  return (name || '')
    .toUpperCase()
    .replace(/\b(PT|CV|UD|TBK|TOKO|PD)\b/g, '')
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface MatchCandidateInput {
  phone?: string | null;
  companyName?: string | null;
  npwp?: string | null;
  email?: string | null;
}

/**
 * Deterministic-signal-only matching. An exact hit on phone/NPWP/email/
 * normalized-company-name is EXACT_MATCH; a bare fuzzy company-name overlap
 * with no other corroborating signal is only ever POSSIBLE_MATCH — never
 * promoted to EXACT (brief section 10's "not fuzzy similarity alone" rule).
 * More than one distinct exact-signal customer is reported as POSSIBLE_MATCH
 * (ambiguous), not auto-picked.
 */
export function matchExistingCustomer(input: MatchCandidateInput, allCustomers: ZohoContact[]): MatchResult {
  const phoneKey = input.phone ? normalizePhoneKey(input.phone) : null;
  const normalizedName = input.companyName ? normalizeCompanyName(input.companyName) : '';
  const npwpDigits = input.npwp ? input.npwp.replace(/\D/g, '') : '';
  const email = input.email ? input.email.trim().toLowerCase() : '';

  const exact = new Map<string, ZohoContact>();
  const possible = new Map<string, ZohoContact>();

  for (const customer of allCustomers) {
    let isExact = false;

    if (phoneKey && customer.phone && normalizePhoneKey(customer.phone) === phoneKey) isExact = true;
    if (npwpDigits && customer.cf_npwp && customer.cf_npwp.replace(/\D/g, '') === npwpDigits) isExact = true;
    if (email && customer.email && customer.email.trim().toLowerCase() === email) isExact = true;
    if (normalizedName && normalizeCompanyName(customer.company_name || customer.contact_name) === normalizedName) isExact = true;

    if (isExact) {
      exact.set(customer.contact_id, customer);
      continue;
    }

    if (normalizedName) {
      const candidateName = normalizeCompanyName(customer.company_name || customer.contact_name);
      if (candidateName && (candidateName.includes(normalizedName) || normalizedName.includes(candidateName))) {
        possible.set(customer.contact_id, customer);
      }
    }
  }

  if (exact.size === 1) return { outcome: 'EXACT_MATCH', candidates: [...exact.values()] };
  if (exact.size > 1) return { outcome: 'POSSIBLE_MATCH', candidates: [...exact.values()] };
  if (possible.size > 0) return { outcome: 'POSSIBLE_MATCH', candidates: [...possible.values()] };
  return { outcome: 'NO_MATCH', candidates: [] };
}
