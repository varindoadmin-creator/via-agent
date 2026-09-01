// ─── Order-intent / inactive-draft detectors ──────────────────────────────────
// VIA Customer Operations Phase 11, brief sections 7, 10, 20: a commercial
// draft only becomes a follow-up candidate when the customer's own next step
// is genuinely pending — never when Sales/VIA itself owns the next action
// (NEEDS_PRICE, WAITING_STOCK are internal/vendor-side and intentionally
// excluded here, same "do not overbuild" scoping other phases used).
//
// A draft stuck in bare DRAFT (no product/customer resolved yet) for a long
// time is ambiguous enough that it becomes an internal Sales task rather than
// a customer message (brief section 20's explicit "ambiguous customer
// context" example).

import { supabaseSelect } from '../../supabase/rest.ts';
import type { ProactiveActionCandidate } from '../types.ts';

function envHours(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

interface DraftRow { id: string; customer_id: string | null; conversation_id: string | null; status: string; total: number | null; updated_at: string }

const CUSTOMER_ACTION_PENDING_STATUSES: Record<string, 'NEEDS_INFORMATION_FOLLOW_UP' | 'ORDER_INTENT_FOLLOW_UP'> = {
  NEEDS_QUANTITY: 'NEEDS_INFORMATION_FOLLOW_UP',
  NEEDS_DELIVERY_INFO: 'NEEDS_INFORMATION_FOLLOW_UP',
  NEEDS_CUSTOMER: 'ORDER_INTENT_FOLLOW_UP',
};

export async function detectOrderIntentFollowUp(): Promise<ProactiveActionCandidate[]> {
  const windowHours = envHours('PROACTIVE_ORDER_INTENT_FOLLOWUP_HOURS', 24);
  const cutoff = new Date(Date.now() - windowHours * 60 * 60_000).toISOString();

  const rows = await supabaseSelect<DraftRow>(
    'commercial_drafts',
    `status=in.(${Object.keys(CUSTOMER_ACTION_PENDING_STATUSES).join(',')})&updated_at=lt.${cutoff}&select=id,customer_id,conversation_id,status,total,updated_at&order=updated_at.asc&limit=100`,
  );

  return rows.map((draft): ProactiveActionCandidate => {
    const type = CUSTOMER_ACTION_PENDING_STATUSES[draft.status];
    const hoursSinceUpdate = Math.round((Date.now() - new Date(draft.updated_at).getTime()) / (60 * 60_000));
    return {
      type,
      customerId: draft.customer_id, conversationId: draft.conversation_id, commercialDraftId: draft.id,
      reason: `Draft is waiting on the customer (${draft.status}) for ${hoursSinceUpdate}h.`,
      evidence: [
        { label: 'Draft status', value: draft.status },
        { label: 'Hours waiting', value: hoursSinceUpdate },
      ],
      recommendedAction: 'Follow up with the customer for the missing information so this order can proceed.',
      channel: 'WHATSAPP', messageCategory: 'TRANSACTIONAL_MESSAGE',
      priority: 'NORMAL', assignedTeam: 'SALES',
      potentialValue: draft.total ?? null, potentialValueLabel: 'Draft order value',
      dedupeKey: `${type}:${draft.id}`,
    };
  });
}

export async function detectInactiveCommercialDrafts(): Promise<ProactiveActionCandidate[]> {
  const windowHours = envHours('PROACTIVE_INACTIVE_DRAFT_HOURS', 72);
  const cutoff = new Date(Date.now() - windowHours * 60 * 60_000).toISOString();

  const rows = await supabaseSelect<DraftRow>(
    'commercial_drafts',
    `status=eq.DRAFT&updated_at=lt.${cutoff}&select=id,customer_id,conversation_id,status,total,updated_at&order=updated_at.asc&limit=100`,
  );

  return rows.map((draft): ProactiveActionCandidate => {
    const hoursSinceUpdate = Math.round((Date.now() - new Date(draft.updated_at).getTime()) / (60 * 60_000));
    return {
      type: 'INACTIVE_COMMERCIAL_DRAFT',
      customerId: draft.customer_id, conversationId: draft.conversation_id, commercialDraftId: draft.id,
      reason: `Draft has had no progress for ${hoursSinceUpdate}h with customer/product context still ambiguous.`,
      evidence: [{ label: 'Hours idle', value: hoursSinceUpdate }],
      recommendedAction: 'Sales should review this abandoned draft and decide whether to re-engage the customer.',
      channel: 'INTERNAL_TASK', assignedTeam: 'SALES', priority: 'LOW',
      dedupeKey: `INACTIVE_COMMERCIAL_DRAFT:${draft.id}`,
    };
  });
}
