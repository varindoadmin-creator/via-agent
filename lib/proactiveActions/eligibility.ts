// ─── Outbound eligibility ──────────────────────────────────────────────────────
// VIA Customer Operations Phase 11, brief sections 14-17: the one gate every
// proactive WhatsApp send passes through immediately before sending —
// independent of how the action was detected or approved. Mirrors the
// "revalidate right before send" discipline Phase 6's
// approveAndCreateCommercialDraft already uses for price/version.

import { getConversationState } from '../integrations/wati/conversationState.ts';
import { isSuppressed } from './suppression.ts';
import { isWithinProactiveCooldown } from './frequency.ts';
import type { MessageCategory } from './types.ts';

export type EligibilityDenialReason = 'HUMAN_ACTIVE' | 'SUPPRESSED' | 'COOLDOWN' | 'NO_PHONE';

export interface EligibilityResult {
  eligible: boolean;
  reason?: EligibilityDenialReason;
}

export interface EligibilityInput {
  customerPhoneNormalized: string | null;
  category: MessageCategory;
  /** Set true only for the exact send that is a follow-up's FIRST stage after detection — cooldown still applies per brief section 17 even then, this flag exists for future differentiation and is currently unused. */
  skipCooldown?: boolean;
}

/**
 * Section 16: a human-owned conversation (NEEDS_HUMAN/HUMAN_ASSIGNED/
 * HUMAN_ACTIVE) suppresses automatic outbound entirely — internal
 * recommendations may still be shown, this only blocks the customer-facing send.
 */
export async function evaluateOutboundEligibility(input: EligibilityInput): Promise<EligibilityResult> {
  if (!input.customerPhoneNormalized) return { eligible: false, reason: 'NO_PHONE' };

  const state = await getConversationState(input.customerPhoneNormalized);
  if (state === 'NEEDS_HUMAN' || state === 'HUMAN_ASSIGNED' || state === 'HUMAN_ACTIVE') {
    return { eligible: false, reason: 'HUMAN_ACTIVE' };
  }

  if (await isSuppressed(input.customerPhoneNormalized, input.category)) {
    return { eligible: false, reason: 'SUPPRESSED' };
  }

  if ((input.category === 'SALES_FOLLOW_UP' || input.category === 'MARKETING_MESSAGE') && !input.skipCooldown) {
    if (await isWithinProactiveCooldown(input.customerPhoneNormalized)) {
      return { eligible: false, reason: 'COOLDOWN' };
    }
  }

  return { eligible: true };
}
