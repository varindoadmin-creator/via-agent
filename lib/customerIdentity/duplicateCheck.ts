// ─── Pre-creation duplicate check ────────────────────────────────────────────
// Brief section 10: before creating a new Zoho Customer, search for existing
// potential duplicates. Reuses matching.ts's deterministic-signal engine —
// EXACT_MATCH here means "this is not actually a new customer" (LIKELY_DUPLICATE,
// human review required, never auto-linked or auto-created); a single
// POSSIBLE_MATCH candidate is also LIKELY_DUPLICATE; more than one candidate
// is AMBIGUOUS. Creating a duplicate Zoho Customer is a critical business
// error (brief section 10), so this errs toward human review over automation.

import type { ZohoContact } from '../../types/zoho.ts';
import { matchExistingCustomer, type MatchCandidateInput } from './matching.ts';

export type DuplicateCheckStatus = 'NO_DUPLICATE' | 'LIKELY_DUPLICATE' | 'AMBIGUOUS';

export interface DuplicateCheckResult {
  status: DuplicateCheckStatus;
  candidateCustomerIds: string[];
}

export function checkForDuplicateCustomer(input: MatchCandidateInput, allCustomers: ZohoContact[]): DuplicateCheckResult {
  const match = matchExistingCustomer(input, allCustomers);
  if (match.outcome === 'NO_MATCH') return { status: 'NO_DUPLICATE', candidateCustomerIds: [] };
  if (match.outcome === 'EXACT_MATCH' || match.candidates.length === 1) {
    return { status: 'LIKELY_DUPLICATE', candidateCustomerIds: match.candidates.map(c => c.contact_id) };
  }
  return { status: 'AMBIGUOUS', candidateCustomerIds: match.candidates.map(c => c.contact_id) };
}
