// ─── Handoff context package ──────────────────────────────────────────────────
// VIA Customer Operations Phase 8, brief sections 66-67: assembled entirely
// from data Phases 2-7 already captured, so Sales/Finance never has to ask
// the customer to repeat what they already told VIA. Only fields the
// recipient's team is authorized to see are included (brief section 55) —
// callers filter by `assignedTeam` before rendering, e.g. never showing
// invoice/payment detail to a team other than FINANCE unless the case is
// actually assigned there.

import { supabaseSelect } from '../supabase/rest.ts';
import { getCustomerById } from '../zoho/customers.ts';
import type { HandoffReason } from './handoffReasons.ts';
import type { WaitingState } from './waitingState.ts';

interface CommercialDraftRow {
  id: string; type: string; status: string; pending_product_name: string | null; pending_item_code: string | null;
  pending_quantity: number | null; pending_unit: string | null; total: number | null; currency: string;
}

interface RecentMessageRow { text: string | null; received_at: string }

export interface HandoffContext {
  reason: HandoffReason | null;
  customerId: string | null;
  customerName: string | null;
  intent: string | null;
  currentWorkflow: string | null;
  productSummary: string | null;
  whatHasAlreadyBeenChecked: string[];
  whatIsMissing: string[];
  recommendedNextAction: string;
  customerLastMessage: string | null;
}

const NEXT_ACTION_FOR_WAITING: Record<NonNullable<WaitingState>, string> = {
  WAITING_CUSTOMER: 'Ask the customer for the missing information (see "what is missing").',
  WAITING_INTERNAL: 'Complete the pending internal review/approval.',
  WAITING_VENDOR: 'Check the vendor stock response before replying to the customer.',
};

export async function buildHandoffContext(input: {
  reason: HandoffReason | null;
  normalizedPhone: string;
  conversationId: string;
  activeCustomerId: string | null;
  currentIntent: string | null;
  waitingState: WaitingState;
}): Promise<HandoffContext> {
  const [customer, drafts, recentMessages] = await Promise.all([
    input.activeCustomerId ? getCustomerById(input.activeCustomerId).catch(() => null) : Promise.resolve(null),
    supabaseSelect<CommercialDraftRow>('commercial_drafts', `conversation_id=eq.${encodeURIComponent(input.conversationId)}&status=not.in.(COMPLETED,FAILED,CANCELLED,STALE)&select=id,type,status,pending_product_name,pending_item_code,pending_quantity,pending_unit,total,currency&order=updated_at.desc&limit=1`).catch(() => []),
    supabaseSelect<RecentMessageRow>('wati_messages', `customer_phone_normalized=eq.${encodeURIComponent(input.normalizedPhone)}&direction=eq.INBOUND&select=text,received_at&order=received_at.desc&limit=1`).catch(() => []),
  ]);

  const draft = drafts[0];
  const whatHasAlreadyBeenChecked: string[] = [];
  const whatIsMissing: string[] = [];
  let productSummary: string | null = null;
  let currentWorkflow: string | null = null;

  if (draft) {
    currentWorkflow = `${draft.type === 'QUOTATION' ? 'Quotation' : 'Sales Order'} draft — ${draft.status}`;
    if (draft.pending_product_name) {
      productSummary = `${draft.pending_item_code ?? ''} ${draft.pending_product_name}`.trim();
      whatHasAlreadyBeenChecked.push(`Product: ${productSummary}`);
      if (draft.pending_quantity) whatHasAlreadyBeenChecked.push(`Quantity: ${draft.pending_quantity}${draft.pending_unit ? ` ${draft.pending_unit}` : ''}`);
      else whatIsMissing.push('Quantity');
    }
    if (draft.total) whatHasAlreadyBeenChecked.push(`Estimated total: ${draft.currency} ${draft.total.toLocaleString('id-ID')}`);
  }

  const recommendedNextAction = input.waitingState
    ? NEXT_ACTION_FOR_WAITING[input.waitingState]
    : 'Review the conversation and respond to the customer directly.';

  return {
    reason: input.reason,
    customerId: input.activeCustomerId,
    customerName: customer?.company_name || customer?.contact_name || null,
    intent: input.currentIntent,
    currentWorkflow,
    productSummary,
    whatHasAlreadyBeenChecked,
    whatIsMissing,
    recommendedNextAction,
    customerLastMessage: recentMessages[0]?.text ?? null,
  };
}
