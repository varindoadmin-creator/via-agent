// ─── Opt-out / suppression ─────────────────────────────────────────────────────
// VIA Customer Operations Phase 11, brief section 15: recognize reasonable
// opt-out intent without treating every negative reply as a global opt-out.
// Two scopes: a broad "stop contacting me" phrase suppresses everything
// proactive; a narrower "stop sending promos" phrase suppresses only
// marketing/sales-follow-up categories, leaving service/transactional
// messages unaffected (brief section 13's category separation).

import { supabaseSelect, supabaseInsert } from '../supabase/rest.ts';

const TABLE = 'customer_outreach_suppressions';

export type SuppressionScope = 'ALL' | 'MARKETING' | 'SALES_FOLLOW_UP';

const BROAD_OPT_OUT_PATTERN = /\b(stop|unsubscribe|berhenti|tidak mau dihubungi|jangan hubungi saya|jangan hubungi lagi)\b/i;
const MARKETING_OPT_OUT_PATTERN = /\b(jangan kirim promo|tidak mau promo|stop promo|no promo|jangan spam)\b/i;

export interface OptOutDetection {
  isOptOut: boolean;
  scope: SuppressionScope | null;
}

/** Deterministic keyword classification only — never an LLM judgment call on whether a customer opted out. */
export function detectOptOutIntent(text: string): OptOutDetection {
  const normalized = text.trim();
  if (!normalized) return { isOptOut: false, scope: null };
  if (MARKETING_OPT_OUT_PATTERN.test(normalized)) return { isOptOut: true, scope: 'MARKETING' };
  if (BROAD_OPT_OUT_PATTERN.test(normalized)) return { isOptOut: true, scope: 'ALL' };
  return { isOptOut: false, scope: null };
}

export async function recordSuppression(customerPhoneNormalized: string, scope: SuppressionScope, sourceText?: string): Promise<void> {
  try {
    await supabaseInsert(TABLE, {
      customer_phone_normalized: customerPhoneNormalized, scope,
      reason: 'CUSTOMER_OPT_OUT', source_text: sourceText ?? null,
    }, false);
    console.info('[proactiveActions.suppression]', JSON.stringify({ event: 'optout.detected', phone: customerPhoneNormalized, scope }));
  } catch (error) {
    console.error('[proactiveActions.suppression] failed to record suppression:', error);
  }
}

/** Best-effort hook for the inbound WATI pipeline: never throws, never blocks the response it's observing. */
export async function checkInboundForOptOut(customerPhoneNormalized: string | null, text: string): Promise<void> {
  if (!customerPhoneNormalized) return;
  try {
    const detection = detectOptOutIntent(text);
    if (detection.isOptOut && detection.scope) {
      await recordSuppression(customerPhoneNormalized, detection.scope, text.slice(0, 500));
    }
  } catch (error) {
    console.error('[proactiveActions.suppression] opt-out check failed:', error);
  }
}

const SCOPES_FOR_CATEGORY: Record<'SALES_FOLLOW_UP' | 'MARKETING_MESSAGE', SuppressionScope[]> = {
  SALES_FOLLOW_UP: ['ALL', 'SALES_FOLLOW_UP'],
  MARKETING_MESSAGE: ['ALL', 'MARKETING', 'SALES_FOLLOW_UP'],
};

/** SERVICE_MESSAGE/TRANSACTIONAL_MESSAGE only check the broad ALL scope (brief section 13: an inquiry justifies service follow-up even after a promo opt-out). */
export async function isSuppressed(customerPhoneNormalized: string, category: 'SERVICE_MESSAGE' | 'TRANSACTIONAL_MESSAGE' | 'SALES_FOLLOW_UP' | 'MARKETING_MESSAGE'): Promise<boolean> {
  const scopes = category === 'SALES_FOLLOW_UP' || category === 'MARKETING_MESSAGE' ? SCOPES_FOR_CATEGORY[category] : ['ALL'];
  const rows = await supabaseSelect<{ id: string }>(
    TABLE,
    `customer_phone_normalized=eq.${encodeURIComponent(customerPhoneNormalized)}&scope=in.(${scopes.join(',')})&select=id&limit=1`,
  );
  return rows.length > 0;
}
