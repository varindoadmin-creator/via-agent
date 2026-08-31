// ─── Sample/catalogue request phone → identity matching ───────────────────────
// VIA Product/Pricing/Company Architecture brief, section 56: read-only
// enrichment for the admin views — reuses Phase 6's own channel-identity
// resolution, never guesses when a phone maps to multiple customers, and
// never creates a Zoho customer merely because a request exists (brief
// section 55 — this module only reads).

import { normalizePhoneKey } from '../customers/phoneKey.ts';
import { resolveCustomerIdentities } from '../customerIdentity/channelIdentity.ts';

export type RequestIdentityMatch = 'KNOWN' | 'MULTIPLE' | 'UNKNOWN';

export async function matchRequestPhoneToIdentity(phone: string | null | undefined): Promise<RequestIdentityMatch> {
  const normalized = normalizePhoneKey(phone ?? undefined);
  if (!normalized) return 'UNKNOWN';
  try {
    const resolution = await resolveCustomerIdentities(normalized);
    if (resolution.status === 'ONE') return 'KNOWN';
    if (resolution.status === 'MANY') return 'MULTIPLE';
    return 'UNKNOWN';
  } catch {
    return 'UNKNOWN';
  }
}
