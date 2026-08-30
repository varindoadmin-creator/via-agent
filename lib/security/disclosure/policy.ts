// ─── Disclosure Policy Service ──────────────────────────────────────────────────
// Brief section 5: the central decision point. Deliberately does NOT govern
// INTERNAL_USER/SYSTEM audiences — that's lib/jarvis/security/policy.ts's job
// (brief section 12: "internal user permissions remain separate", this
// service must not duplicate or conflict with it). This service exists purely
// to decide what EXTERNAL_CUSTOMER may see.

import type { AudienceContext, IdentityLevel } from './audience.ts';
import { classificationForCategory, type DataCategory } from './classification.ts';

export type DisclosureDecision = 'ALLOW' | 'DENY' | 'VERIFY_IDENTITY' | 'ESCALATE';

export type DisclosureReasonCode =
  | 'INTERNAL_USER_GOVERNED_ELSEWHERE'
  | 'PUBLIC_DATA_ALLOWED'
  | 'CUSTOMER_SHAREABLE_ALLOWED'
  | 'CUSTOMER_OWNED_RESOURCE_ALLOWED'
  | 'CUSTOMER_IDENTITY_REQUIRED'
  | 'INTERNAL_DATA_EXTERNAL_DENIED'
  | 'CONFIDENTIAL_DATA_EXTERNAL_DENIED'
  | 'CROSS_CUSTOMER_ACCESS_DENIED'
  | 'RESTRICTED_DATA_DENIED'
  | 'POLICY_EVALUATION_FAILED';

export interface DisclosureResult {
  decision: DisclosureDecision;
  reasonCode: DisclosureReasonCode;
}

export interface EvaluateDisclosureInput {
  audience: AudienceContext;
  category: DataCategory;
  /** Required for CUSTOMER_SCOPED categories — the resource's actual owner. */
  ownerCustomerId?: string;
  /** Defaults to CUSTOMER_MATCHED for CUSTOMER_SCOPED data. */
  requiredIdentityLevel?: IdentityLevel;
}

const IDENTITY_LEVEL_RANK: Record<IdentityLevel, number> = {
  ANONYMOUS: 0,
  PHONE_MATCHED: 1,
  CUSTOMER_MATCHED: 2,
  VERIFIED_CUSTOMER: 3,
  INTERNAL_AUTHENTICATED: 4,
};

function identityLevelSatisfies(actual: IdentityLevel, required: IdentityLevel): boolean {
  return IDENTITY_LEVEL_RANK[actual] >= IDENTITY_LEVEL_RANK[required];
}

function evaluateExternal(input: EvaluateDisclosureInput): DisclosureResult {
  const classification = classificationForCategory(input.category);

  switch (classification) {
    case 'PUBLIC':
      return { decision: 'ALLOW', reasonCode: 'PUBLIC_DATA_ALLOWED' };
    case 'CUSTOMER_SHAREABLE':
      return { decision: 'ALLOW', reasonCode: 'CUSTOMER_SHAREABLE_ALLOWED' };
    case 'CUSTOMER_SCOPED': {
      if (!input.ownerCustomerId) return { decision: 'DENY', reasonCode: 'CUSTOMER_IDENTITY_REQUIRED' };
      if (!input.audience.customerId) return { decision: 'VERIFY_IDENTITY', reasonCode: 'CUSTOMER_IDENTITY_REQUIRED' };
      if (input.audience.customerId !== input.ownerCustomerId) return { decision: 'DENY', reasonCode: 'CROSS_CUSTOMER_ACCESS_DENIED' };
      const requiredLevel = input.requiredIdentityLevel ?? 'CUSTOMER_MATCHED';
      if (!identityLevelSatisfies(input.audience.identityLevel, requiredLevel)) return { decision: 'VERIFY_IDENTITY', reasonCode: 'CUSTOMER_IDENTITY_REQUIRED' };
      return { decision: 'ALLOW', reasonCode: 'CUSTOMER_OWNED_RESOURCE_ALLOWED' };
    }
    case 'INTERNAL':
      return { decision: 'DENY', reasonCode: 'INTERNAL_DATA_EXTERNAL_DENIED' };
    case 'CONFIDENTIAL':
      return { decision: 'DENY', reasonCode: 'CONFIDENTIAL_DATA_EXTERNAL_DENIED' };
    case 'RESTRICTED':
      return { decision: 'DENY', reasonCode: 'RESTRICTED_DATA_DENIED' };
  }
}

/**
 * Fails closed (brief section 35): any unexpected error while evaluating for
 * an external audience becomes DENY, never ALLOW. Internal/system audiences
 * are intentionally out of scope here — see the module comment.
 */
export function evaluateDisclosure(input: EvaluateDisclosureInput): DisclosureResult {
  // The whole function is inside the fail-closed boundary — a malformed
  // `input.audience` (e.g. null/undefined from an upstream bug) must still
  // resolve to a controlled DENY, never an uncaught exception (brief section
  // 35 wants a decision object, not a crash to bubble up to the caller).
  try {
    if (input.audience.actorType !== 'EXTERNAL_CUSTOMER') {
      return { decision: 'ALLOW', reasonCode: 'INTERNAL_USER_GOVERNED_ELSEWHERE' };
    }
    return evaluateExternal(input);
  } catch {
    return { decision: 'DENY', reasonCode: 'POLICY_EVALUATION_FAILED' };
  }
}
