// ─── Commercial funnel ────────────────────────────────────────────────────────
// VIA Customer Operations Phase 9, brief sections 10-13, 19, 26-27, 64,
// 93-94: uses commercial_drafts' OWN real linkage (conversation_id,
// zoho_object_id/zoho_object_number once executed) — never inferred from
// same-phone-within-a-time-window. A Zoho order without a Customer
// Operations source (no matching commercial_drafts row) is never falsely
// counted into the WhatsApp funnel (Test 94).

import { supabaseSelect } from '../supabase/rest.ts';
import type { DateRange } from './periods.ts';

interface DraftRow {
  id: string; type: 'QUOTATION' | 'SALES_ORDER'; status: string;
  zoho_object_id: string | null; zoho_object_number: string | null; total: number | null; created_at: string;
}

export interface CommercialFunnelResult {
  draftsCreated: number;
  quotationsCreated: number;
  ordersCreated: number;
  /** Brief section 64: explicit denominator — attributable drafts with a resulting SO, over eligible attributable drafts (not "all messages"). */
  draftToOrderConversion: number | null;
  soValue: number;
}

export async function getCommercialFunnel(range: DateRange): Promise<CommercialFunnelResult> {
  const drafts = await supabaseSelect<DraftRow>(
    'commercial_drafts',
    `created_at=gte.${range.start.toISOString()}&created_at=lt.${range.end.toISOString()}&select=id,type,status,zoho_object_id,zoho_object_number,total,created_at`,
  );

  const draftsCreated = drafts.length;
  const quotationsCreated = drafts.filter(d => d.type === 'QUOTATION' && d.zoho_object_id).length;
  const executedOrders = drafts.filter(d => d.type === 'SALES_ORDER' && d.zoho_object_id);
  const ordersCreated = executedOrders.length;
  // Section 13: SO value here is the draft's own approved-price total at
  // execution time, already sourced from live Zoho pricing (Phase 5/6) —
  // never a recomputation from a WhatsApp-quoted figure.
  const soValue = executedOrders.reduce((sum, d) => sum + (d.total ?? 0), 0);

  const eligibleDrafts = drafts.filter(d => d.status !== 'CANCELLED' && d.status !== 'DRAFT');
  const draftToOrderConversion = eligibleDrafts.length === 0 ? null : ordersCreated / eligibleDrafts.length;

  return { draftsCreated, quotationsCreated, ordersCreated, draftToOrderConversion, soValue };
}
