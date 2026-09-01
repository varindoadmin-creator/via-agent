// ─── Outbound approval levels ──────────────────────────────────────────────────
// VIA Customer Operations Phase 11, brief section 30: AUTO_ALLOWED /
// REQUIRES_REVIEW / PROHIBITED per action type. Reorder and dormant-customer
// outreach are hardcoded to REQUIRES_REVIEW regardless of flags — the brief
// is explicit that these need validated policy before any auto-send, not
// merely "off by default until a flag flips" (section 9, section 26).

import type { ProactiveActionChannel, ProactiveActionType, OutboundApprovalLevel } from './types.ts';
import { isAutoServiceFollowupEnabled, isAutoCommercialOutreachEnabled } from '../customerIdentity/featureFlags.ts';
import { rolloutEnabled } from '../customerIdentity/rolloutFlag.ts';

function envPercent(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : fallback;
}

/**
 * An INTERNAL_TASK never reaches the customer — it only ever creates a Sales
 * Opportunities queue entry — so it is always AUTO_ALLOWED regardless of type.
 *
 * `rolloutKey` (customer ID or phone) is optional and only consulted for
 * QUOTATION_FOLLOW_UP (Phase 13, brief section 26/27 — safe staged rollout
 * for the one auto-send path this codebase has). Its default,
 * `AUTO_COMMERCIAL_OUTREACH_ROLLOUT_PERCENT=100`, preserves the exact
 * pre-Phase-13 behavior: once the master flag is on, every customer gets it.
 */
export function approvalLevelForAction(type: ProactiveActionType, channel: ProactiveActionChannel, rolloutKey?: string): OutboundApprovalLevel {
  if (channel === 'INTERNAL_TASK') return 'AUTO_ALLOWED';

  switch (type) {
    case 'ORDER_INTENT_FOLLOW_UP':
    case 'NEEDS_INFORMATION_FOLLOW_UP':
      return isAutoServiceFollowupEnabled() ? 'AUTO_ALLOWED' : 'REQUIRES_REVIEW';
    case 'QUOTATION_FOLLOW_UP': {
      if (!isAutoCommercialOutreachEnabled()) return 'REQUIRES_REVIEW';
      const percent = envPercent('AUTO_COMMERCIAL_OUTREACH_ROLLOUT_PERCENT', 100);
      if (percent >= 100) return 'AUTO_ALLOWED';
      if (!rolloutKey) return 'REQUIRES_REVIEW'; // no stable key to bucket on — never silently default to auto-allowed.
      return rolloutEnabled('AUTO_COMMERCIAL_OUTREACH', percent, rolloutKey) ? 'AUTO_ALLOWED' : 'REQUIRES_REVIEW';
    }
    case 'CUSTOMER_CALLBACK':
      return 'AUTO_ALLOWED';
    case 'REORDER_OPPORTUNITY':
    case 'DORMANT_CUSTOMER_REENGAGEMENT':
    case 'SERVICE_RECOVERY':
    case 'SAMPLE_REQUEST_FOLLOW_UP':
    case 'INACTIVE_COMMERCIAL_DRAFT':
    case 'APPROVED_CAMPAIGN_OUTREACH':
      return 'REQUIRES_REVIEW';
    default:
      return 'REQUIRES_REVIEW';
  }
}

export function requiresApproval(level: OutboundApprovalLevel): boolean {
  return level !== 'AUTO_ALLOWED';
}
