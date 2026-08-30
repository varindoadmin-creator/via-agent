// ─── Outbound disclosure gate ────────────────────────────────────────────────
// Brief section 8: a second check right before every WATI send, independent of
// how the response text was produced. Today's WATI/stock templates are all
// fixed strings that structurally cannot carry this data (Phase 2/3's own
// design), so this should never actually fire in normal operation — it exists
// as defense-in-depth for the day a future change accidentally starts
// building response text from raw internal fields.

import { sendWatiText, type WatiSendResult } from '../../integrations/wati/client.ts';
import { recordCustomerSecurityEvent } from './securityEvents.ts';

const SENSITIVE_KEYWORD_PATTERN = /\b(margin|markup|modal|hpp|cost|supplier|harga beli|discount floor|komisi)\b/i;
const NUMBER_PATTERN = /\brp\.?\s?[\d.,]+|\b\d{2,}\b/i;

export interface OutboundCheckResult {
  safe: boolean;
  reason?: string;
}

/** A sensitive keyword co-occurring with any figure is something no legitimate customer-safe template should ever produce. */
export function checkOutboundText(text: string): OutboundCheckResult {
  if (SENSITIVE_KEYWORD_PATTERN.test(text) && NUMBER_PATTERN.test(text)) {
    return { safe: false, reason: 'SENSITIVE_KEYWORD_WITH_FIGURE' };
  }
  return { safe: true };
}

export type GatedSendResult = WatiSendResult | 'blocked';

/** Drop-in replacement for a direct sendWatiText call on any customer-facing response. */
export async function sendWatiTextGated(whatsappNumber: string, text: string, context: { conversationId?: string; category?: string } = {}): Promise<GatedSendResult> {
  const check = checkOutboundText(text);
  if (!check.safe) {
    recordCustomerSecurityEvent({
      event: 'outbound_disclosure_blocked',
      conversationId: context.conversationId ?? 'unknown',
      category: context.category ?? 'unknown',
      decision: 'DENY',
      reasonCode: check.reason ?? 'UNKNOWN',
    });
    return 'blocked';
  }
  return sendWatiText(whatsappNumber, text);
}
