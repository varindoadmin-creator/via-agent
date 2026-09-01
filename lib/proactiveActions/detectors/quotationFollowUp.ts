// ─── Quotation follow-up detector ─────────────────────────────────────────────
// VIA Customer Operations Phase 11, brief sections 5-6, 19: per-quotation
// (not aggregate — that's Phase 10's QUOTATION_FOLLOW_UP_OPPORTUNITY finding,
// left unchanged) follow-up candidates, in two bounded stages. A quotation is
// "sent" once its commercial draft reached COMPLETED with a real Zoho
// zoho_object_id (an actual Estimate exists); "converted" is approximated as
// the customer placing a completed SALES_ORDER draft afterwards — commercial_drafts
// has no direct quotation->order link field, so this is a best-effort check,
// documented as a known limitation in docs/proactive-customer-sales-automation.md.
//
// VIA has no authoritative quotation-validity/expiry date on commercial_drafts
// today, so this detector never claims a quotation has expired (brief section
// 6: "do not fabricate validity") — messageContent.ts's quotationExpired fact
// is always left unset from this detector.

import { supabaseSelect } from '../../supabase/rest.ts';
import { getActionByDedupeKey } from '../store.ts';
import type { ProactiveActionCandidate } from '../types.ts';

function envHours(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

interface DraftRow {
  id: string; customer_id: string | null; conversation_id: string | null;
  total: number | null; updated_at: string; zoho_object_id: string | null; zoho_object_number: string | null;
}

async function hasSubsequentOrder(customerId: string, sinceIso: string): Promise<boolean> {
  const rows = await supabaseSelect<{ id: string }>(
    'commercial_drafts',
    `type=eq.SALES_ORDER&status=eq.COMPLETED&customer_id=eq.${encodeURIComponent(customerId)}&created_at=gt.${sinceIso}&select=id&limit=1`,
  );
  return rows.length > 0;
}

export async function detectQuotationFollowUp(): Promise<ProactiveActionCandidate[]> {
  const initialWindowHours = envHours('PROACTIVE_QUOTATION_INITIAL_FOLLOWUP_HOURS', 48);
  const finalWindowHours = envHours('PROACTIVE_QUOTATION_FINAL_FOLLOWUP_HOURS', 120);

  const initialCutoff = new Date(Date.now() - initialWindowHours * 60 * 60_000).toISOString();
  const quotations = await supabaseSelect<DraftRow>(
    'commercial_drafts',
    `type=eq.QUOTATION&status=eq.COMPLETED&zoho_object_id=not.is.null&updated_at=lt.${initialCutoff}&select=id,customer_id,conversation_id,total,updated_at,zoho_object_id,zoho_object_number&order=updated_at.asc&limit=100`,
  );

  const candidates: ProactiveActionCandidate[] = [];

  for (const draft of quotations) {
    if (!draft.customer_id) continue;
    if (await hasSubsequentOrder(draft.customer_id, draft.updated_at)) continue;

    const hoursSinceUpdate = (Date.now() - new Date(draft.updated_at).getTime()) / (60 * 60_000);
    const evidence = [
      { label: 'Quotation number', value: draft.zoho_object_number ?? draft.zoho_object_id ?? draft.id },
      { label: 'Quotation value (IDR)', value: draft.total ?? 0 },
      { label: 'Hours since last update', value: Math.round(hoursSinceUpdate) },
    ];

    const initialDedupeKey = `QUOTATION_FOLLOW_UP:${draft.id}:INITIAL_FOLLOW_UP`;
    const existingInitial = await getActionByDedupeKey(initialDedupeKey);

    candidates.push({
      type: 'QUOTATION_FOLLOW_UP',
      customerId: draft.customer_id, conversationId: draft.conversation_id, quotationId: draft.zoho_object_id,
      commercialDraftId: draft.id,
      reason: `Quotation ${draft.zoho_object_number ?? draft.id} has had no update in ${Math.round(hoursSinceUpdate)}h with no order placed since.`,
      evidence,
      recommendedAction: 'Follow up with the customer on this open quotation.',
      channel: 'WHATSAPP', messageCategory: 'SALES_FOLLOW_UP',
      priority: 'NORMAL',
      assignedTeam: 'SALES', followUpStage: 'INITIAL_FOLLOW_UP',
      potentialValue: draft.total ?? null, potentialValueLabel: 'Active quotation value',
      dedupeKey: initialDedupeKey,
    });

    // Stage 2 only after stage 1 was actually sent — never skip straight to FINAL_FOLLOW_UP.
    if (existingInitial && (existingInitial.status === 'SENT' || existingInitial.status === 'CUSTOMER_RESPONDED') && hoursSinceUpdate >= initialWindowHours + finalWindowHours) {
      candidates.push({
        type: 'QUOTATION_FOLLOW_UP',
        customerId: draft.customer_id, conversationId: draft.conversation_id, quotationId: draft.zoho_object_id,
        commercialDraftId: draft.id,
        reason: `Quotation ${draft.zoho_object_number ?? draft.id} still has no order after the first follow-up.`,
        evidence,
        recommendedAction: 'Send a final follow-up, then return this lead to the Sales queue for manual handling.',
        channel: 'WHATSAPP', messageCategory: 'SALES_FOLLOW_UP',
        priority: 'NORMAL',
        assignedTeam: 'SALES', followUpStage: 'FINAL_FOLLOW_UP',
        potentialValue: draft.total ?? null, potentialValueLabel: 'Active quotation value',
        dedupeKey: `QUOTATION_FOLLOW_UP:${draft.id}:FINAL_FOLLOW_UP`,
      });
    }
  }

  return candidates;
}
