// ─── Customer-facing security event logging ─────────────────────────────────────
// Brief section 33: every denied/sensitive request auditable, without ever
// logging the confidential value itself. Same shape/console convention as
// lib/jarvis/security/events.ts's recordJarvisSecurityEvent, extended for the
// non-Jarvis WATI pipeline.

import type { DisclosureDecision, DisclosureReasonCode } from './policy.ts';

export interface CustomerSecurityEvent {
  event: 'disclosure_decision' | 'outbound_disclosure_blocked' | 'tool_access_denied';
  conversationId: string;
  category: string;
  decision: DisclosureDecision | 'DENY';
  reasonCode: DisclosureReasonCode | string;
}

export function recordCustomerSecurityEvent(event: CustomerSecurityEvent): void {
  // Deliberately omit message text, resolved values, and any business figure —
  // only the category/decision/reason are safe to log.
  console.info('[wati.security]', JSON.stringify({ ...event, timestamp: new Date().toISOString() }));
}
