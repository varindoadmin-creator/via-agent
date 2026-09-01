// ─── Proactive outreach send pipeline ─────────────────────────────────────────
// VIA Customer Operations Phase 11, brief sections 11-12, 30-31, 42-44: the
// one path from an approved/auto-allowed ProactiveCustomerAction to an actual
// WATI send. Every fact (customer active, price if ever added, item still
// active) is re-resolved right here, immediately before sending — never
// trusted from when the action was detected — mirroring
// approveAndCreateCommercialDraft's exact "revalidate right before write"
// discipline. Optimistic-concurrency `version` transitions double as the
// outbound idempotency guard: two concurrent workers racing the same action
// can both attempt this, but only the first PATCH (matching `version`)
// succeeds — the second gets a conflict and must not retry the send.

import { getAction, markSent, markFailed, type ProactiveActor } from './store.ts';
import { evaluateOutboundEligibility } from './eligibility.ts';
import { getPrimaryWhatsappForCustomer } from './customerContact.ts';
import { quotationFollowUpMessage, buildMessageForAction, type MessageFacts } from './messageContent.ts';
import { getCustomerById } from '../zoho/customers.ts';
import { getItemDetail } from '../zoho/items.ts';
import { getCommercialDraft } from '../integrations/wati/commercial/draft.ts';
import { sendWatiTextGated } from '../security/disclosure/disclosureGate.ts';
import { recordAnalyticsEvent } from '../analytics/events.ts';
import { isAnalyticsEventPipelineEnabled } from '../customerIdentity/featureFlags.ts';
import { enqueueJob } from '../jobs/queue.ts';
import type { ProactiveCustomerAction, MessageCategory } from './types.ts';

export type SendOutcome =
  | { result: 'SENT' }
  | { result: 'SKIPPED'; reason: string }
  | { result: 'FAILED'; reason: string };

async function resolveFacts(action: ProactiveCustomerAction): Promise<MessageFacts> {
  const facts: MessageFacts = {};
  if (action.customerId) {
    const customer = await getCustomerById(action.customerId).catch(() => null);
    facts.companyName = customer?.company_name ?? customer?.contact_name ?? null;
  }
  if (action.productId) {
    const item = await getItemDetail(action.productId).catch(() => null);
    facts.productName = item?.name ?? null;
  }
  if (action.type === 'QUOTATION_FOLLOW_UP' && action.commercialDraftId) {
    const draft = await getCommercialDraft(action.commercialDraftId).catch(() => null);
    facts.quotationNumber = draft?.zoho_object_number ?? null;
    // No authoritative quotation-validity date exists in this schema — never
    // fabricated (brief section 6). facts.quotationExpired stays unset.
  }
  return facts;
}

async function emitEvent(eventType: string, action: ProactiveCustomerAction): Promise<void> {
  if (!isAnalyticsEventPipelineEnabled()) return;
  void recordAnalyticsEvent({
    eventType: eventType as never, sourceId: `${action.id}:${eventType}`, conversationId: action.conversationId,
    customerId: action.customerId, productId: action.productId, draftId: action.commercialDraftId, source: 'PROACTIVE',
  });
}

/**
 * Sends exactly one WHATSAPP-channel action. Never called for INTERNAL_TASK
 * actions — those are resolved entirely inside the Sales Opportunities queue.
 */
export async function sendProactiveOutreach(actionId: string): Promise<SendOutcome> {
  const action = await getAction(actionId);
  if (!action) return { result: 'FAILED', reason: 'ACTION_NOT_FOUND' };
  if (action.channel !== 'WHATSAPP') return { result: 'SKIPPED', reason: 'NOT_A_MESSAGE_ACTION' };
  if (action.status !== 'DETECTED' && action.status !== 'APPROVED') return { result: 'SKIPPED', reason: `NOT_SENDABLE_STATUS:${action.status}` };
  if (action.status === 'DETECTED' && action.requiresApproval) return { result: 'SKIPPED', reason: 'AWAITING_APPROVAL' };

  const phone = action.customerPhoneNormalized ?? (action.customerId ? await getPrimaryWhatsappForCustomer(action.customerId) : null);
  if (!phone) {
    await markFailed(action.id, action.version, 'NO_PHONE');
    return { result: 'FAILED', reason: 'NO_PHONE' };
  }

  if (action.customerId) {
    const customer = await getCustomerById(action.customerId).catch(() => null);
    if (!customer || customer.status !== 'active') {
      await markFailed(action.id, action.version, 'CUSTOMER_INACTIVE');
      return { result: 'FAILED', reason: 'CUSTOMER_INACTIVE' };
    }
  }

  const category: MessageCategory = action.messageCategory ?? 'SERVICE_MESSAGE';
  const eligibility = await evaluateOutboundEligibility({ customerPhoneNormalized: phone, category });
  if (!eligibility.eligible) {
    await emitEvent('outbound.eligibility_denied', action);
    if (eligibility.reason === 'SUPPRESSED') {
      await emitEvent('outbound.optout_detected', action);
      await emitEvent('proactive_action.suppressed', action);
      await markFailed(action.id, action.version, 'SUPPRESSED');
      return { result: 'FAILED', reason: 'SUPPRESSED' };
    }
    // HUMAN_ACTIVE / COOLDOWN are transient — leave the action sendable for the next sweep.
    return { result: 'SKIPPED', reason: eligibility.reason ?? 'NOT_ELIGIBLE' };
  }

  const facts = await resolveFacts(action);
  const message = action.type === 'QUOTATION_FOLLOW_UP'
    ? quotationFollowUpMessage(facts, action.followUpStage ?? 'INITIAL_FOLLOW_UP')
    : buildMessageForAction(action.type, facts);
  if (!message) {
    await markFailed(action.id, action.version, 'NO_TEMPLATE');
    return { result: 'FAILED', reason: 'NO_TEMPLATE' };
  }

  const sendResult = await sendWatiTextGated(phone, message, { conversationId: action.conversationId ?? phone, category: action.type });

  if (sendResult === 'sent') {
    try {
      await markSent(action.id, action.version, message);
    } catch (error) {
      // Version conflict = another worker already sent this action (brief
      // section 44's exact scenario) — the message already went out once;
      // never retry, just report it as prevented, not a failure.
      await emitEvent('outbound.duplicate_prevented', action);
      return { result: 'SKIPPED', reason: 'DUPLICATE_PREVENTED' };
    }
    await emitEvent('proactive_action.sent', action);
    return { result: 'SENT' };
  }

  if (sendResult === 'blocked') {
    await markFailed(action.id, action.version, 'DISCLOSURE_BLOCKED');
    return { result: 'FAILED', reason: 'DISCLOSURE_BLOCKED' };
  }

  // 'disabled' (WATI not configured) or 'failed' (transient send error) —
  // leave the action sendable so the next sweep retries; never mark it
  // FAILED for a transport problem that might resolve on its own. Phase 13,
  // brief section 9/35: also enqueue a durable retry job so a persistently
  // failing send surfaces in the DLQ instead of silently depending on the
  // sweep noticing forever. Idempotency-keyed on the action's current
  // version, so repeated sweep ticks hitting the same failure never create a
  // second row — one DLQ entry per distinct failure episode.
  await enqueueJob({
    jobType: 'wati_send_retry',
    payload: { actionId: action.id, reason: sendResult },
    idempotencyKey: `sendOutreach:${action.id}:${action.version}`,
  }).catch(error => console.error('[proactiveActions.sendOutreach]', JSON.stringify({ event: 'enqueue_retry_failed', actionId: action.id, error: error instanceof Error ? error.message : String(error) })));
  return { result: 'SKIPPED', reason: sendResult };
}

export type { ProactiveActor };
