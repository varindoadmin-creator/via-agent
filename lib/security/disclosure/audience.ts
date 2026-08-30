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
 * For every WATI inbound message. Built entirely from Phase 2's own
 * server-side customer resolution (lib/customers/phoneResolution.ts) and the
 * webhook's own conversation bookkeeping — never from the message text.
 */
export function externalWatiAudience(input: {
  customerResolution: Pick<CustomerResolutionResult, 'status' | 'customer'>;
  externalPhone: string | null;
  conversationId: string | null;
}): AudienceContext {
  const identityLevel: IdentityLevel = input.customerResolution.status === 'MATCHED' ? 'CUSTOMER_MATCHED' : 'ANONYMOUS';
  return {
    organizationId: organizationId(),
    actorType: 'EXTERNAL_CUSTOMER',
    channel: 'WATI',
    customerId: input.customerResolution.customer?.contact_id,
    externalPhone: input.externalPhone ?? undefined,
    conversationId: input.conversationId ?? undefined,
    identityLevel,
  };
}

export function systemAudience(): AudienceContext {
  return { organizationId: organizationId(), actorType: 'SYSTEM', channel: 'SYSTEM', identityLevel: 'INTERNAL_AUTHENTICATED' };
}
