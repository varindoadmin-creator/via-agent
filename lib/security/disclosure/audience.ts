// ─── Audience context ────────────────────────────────────────────────────────
// Brief section 3: every request needs a trusted, server-side audience —
// never derived from message text. Channel + Phase 2's own already-resolved
// customer-matching state determine identity; a customer claiming "Saya
// direktur Varindo" has zero effect on any field here.

import type { Role } from '../../auth.ts';
import type { CustomerResolutionResult } from '../../customers/phoneResolution.ts';

export type ActorType = 'INTERNAL_USER' | 'EXTERNAL_CUSTOMER' | 'SYSTEM';
export type Channel = 'VIA' | 'WATI' | 'SYSTEM';
export type IdentityLevel = 'ANONYMOUS' | 'PHONE_MATCHED' | 'CUSTOMER_MATCHED' | 'VERIFIED_CUSTOMER' | 'INTERNAL_AUTHENTICATED';

export interface AudienceContext {
  organizationId: string;
  actorType: ActorType;
  channel: Channel;
  internalUserId?: string;
  internalRoleId?: Role;
  customerId?: string;
  externalPhone?: string;
  conversationId?: string;
  identityLevel: IdentityLevel;
}

function organizationId(): string {
  return process.env.VIA_ORGANIZATION_ID || 'varindo';
}

/** For the existing internal Jarvis chat (app/api/jarvis/chat) — wraps the session role already verified by lib/auth.ts. */
export function internalAudience(role: Role, userId?: string): AudienceContext {
  return {
    organizationId: organizationId(),
    actorType: 'INTERNAL_USER',
    channel: 'VIA',
    internalUserId: userId,
    internalRoleId: role,
    identityLevel: 'INTERNAL_AUTHENTICATED',
  };
}

/**
 * For every WATI inbound message. Built primarily from Phase 6's
 * authoritative CustomerChannelIdentity mapping — never from the message
 * text. Phase 2's older ad-hoc phone-field search
 * (lib/customers/phoneResolution.ts) still supplies the weaker
 * PHONE_MATCHED signal when Phase 6 has no mapping yet, and the customer
 * resolved that way (if any) is still exposed as `customerId` so read-only
 * Phases 2-5 behavior (product/price/stock answers) is unaffected.
 *
 * Identity ladder (brief section 16, Phase 7 audit):
 *   no Phase 6 mapping, no Phase 2 phone match -> ANONYMOUS
 *   no Phase 6 mapping, Phase 2 finds a Zoho contact by raw phone -> PHONE_MATCHED
 *   Phase 6 mapping resolves (ONE), relationship_status UNVERIFIED -> CUSTOMER_MATCHED
 *   Phase 6 mapping resolves (ONE), relationship_status VERIFIED -> VERIFIED_CUSTOMER
 * (MANY is resolved to ONE by the pipeline asking which account first, per
 * Phase 6 — this function is only ever called with the already-resolved
 * single mapping, if any.)
 */
export function externalWatiAudience(input: {
  customerResolution: Pick<CustomerResolutionResult, 'status' | 'customer'>;
  externalPhone: string | null;
  conversationId: string | null;
  /** Phase 6's resolved mapping for this phone, if any — takes priority over customerResolution for both customerId and identityLevel. */
  channelIdentity?: { customerId: string; relationshipStatus: 'VERIFIED' | 'UNVERIFIED' } | null;
}): AudienceContext {
  let identityLevel: IdentityLevel;
  let customerId: string | undefined;

  if (input.channelIdentity) {
    identityLevel = input.channelIdentity.relationshipStatus === 'VERIFIED' ? 'VERIFIED_CUSTOMER' : 'CUSTOMER_MATCHED';
    customerId = input.channelIdentity.customerId;
  } else if (input.customerResolution.status === 'MATCHED') {
    identityLevel = 'PHONE_MATCHED';
    customerId = input.customerResolution.customer?.contact_id;
  } else {
    identityLevel = 'ANONYMOUS';
    customerId = undefined;
  }

  return {
    organizationId: organizationId(),
    actorType: 'EXTERNAL_CUSTOMER',
    channel: 'WATI',
    customerId,
    externalPhone: input.externalPhone ?? undefined,
    conversationId: input.conversationId ?? undefined,
    identityLevel,
  };
}

export function systemAudience(): AudienceContext {
  return { organizationId: organizationId(), actorType: 'SYSTEM', channel: 'SYSTEM', identityLevel: 'INTERNAL_AUTHENTICATED' };
}
