// ─── WATI inbound pipeline orchestration ────────────────────────────────────────
// WATI Message Received -> normalize -> idempotency gate -> quantity-follow-up
// check -> customer resolution -> intent -> product resolution -> response
// decision -> stock workflow (Phase 3) -> outbound send. Every step after the
// idempotency gate is best-effort: a failure here must never break the
// webhook's HTTP 200 contract (brief section 30), so the route wraps this in
// its own try/catch and always acknowledges.

import { normalizeWatiMessage } from './message.ts';
import { reserveWatiMessage, updateWatiMessageResolution, countRecentWatiMessages } from './store.ts';
import { resolveCustomerByPhone } from '../../customers/phoneResolution.ts';
import { getConversationState, touchConversationState } from './conversationState.ts';
import { detectIntent } from './intent.ts';
import { parseWebsiteStructuredProduct } from './websiteParser.ts';
import { resolveSource } from './source.ts';
import { extractQuantity } from './quantity.ts';
import { resolveProduct } from './productResolution.ts';
import { resolveConversationContext } from './context.ts';
import { decideResponse, systemErrorFallback } from './responseDecision.ts';
import { createStockInquiry } from './stockInquiries.ts';
import { redact } from '../../redact.ts';
import { externalWatiAudience } from '../../security/disclosure/audience.ts';
import { sendWatiTextGated } from '../../security/disclosure/disclosureGate.ts';
import { recordCustomerSecurityEvent } from '../../security/disclosure/securityEvents.ts';
import { getItemDetail } from '../../zoho/items.ts';
import { matchQuantityFollowUp } from './stock/quantityFollowUp.ts';
import { classifyQuantityInquiry } from './stock/quantityInquiryType.ts';
import { startVendorCheck } from './stock/service.ts';
import { updateStockInquiry } from './stock/store.ts';
import { needQuantityPrompt } from './stock/responses.ts';
import { getCustomerSafePrice } from './pricing/customerSafePrice.ts';
import { formatIDR } from '../../zoho/tax.ts';
import { priceOnly, priceWithStockAck, priceWithNeedQuantity, priceNotFound } from './pricing/responses.ts';
import { checkWebsitePriceMismatch, logWebsitePriceMismatch } from './pricing/websiteMismatch.ts';
import { matchCommercialFollowUp } from './commercial/followUp.ts';
import { continueOnboarding, resumeCustomerSelection, resumeAddressSelection, runCommercialWorkflow } from './commercial/workflow.ts';
import {
  isCommercialDraftEnabled, isCustomerIdentityMappingEnabled,
  isCustomerOrderStatusEnabled, isCustomerInvoiceStatusEnabled, isCustomerInvoiceDocumentEnabled,
  isCustomerPaymentStatusEnabled, isCustomerReceivableSummaryEnabled, isCustomerDeliveryStatusEnabled,
  isCustomerServiceHandoffEnabled, isContextualGreetingEnabled,
} from '../../customerIdentity/featureFlags.ts';
import { triggerHandoff } from '../../customerService/handoff.ts';
import type { HandoffReason } from '../../customerService/handoffReasons.ts';
import { getServiceCase } from './conversationState.ts';
import { recordAnalyticsEvent } from '../../analytics/events.ts';
import { isAnalyticsEventPipelineEnabled } from '../../customerIdentity/featureFlags.ts';
import { resolveCustomerIdentities } from '../../customerIdentity/channelIdentity.ts';
import { runCustomerSelfService, resumeSelfServiceAfterSelection } from './selfService/orchestrator.ts';
import { getPendingSelfService } from './conversationState.ts';
import { checkInboundForOptOut } from '../../proactiveActions/suppression.ts';

const MAX_MESSAGES_PER_MINUTE = 20;

export interface PipelineOutcome {
  status: 'duplicate' | 'ignored_outbound' | 'ignored_non_text' | 'rate_limited' | 'processed' | 'failed';
  intent?: string;
  responseCase?: string;
  sent?: boolean;
}

export async function processInboundWatiMessage(payload: Record<string, unknown>): Promise<PipelineOutcome> {
  const message = normalizeWatiMessage(payload);
  const reservation = await reserveWatiMessage(message);
  if (reservation.outcome === 'duplicate') {
    return { status: 'duplicate' };
  }

  const { id, customerPhoneNormalized } = reservation;

  if (message.direction === 'OUTBOUND') {
    await updateWatiMessageResolution(id, { processingStatus: 'OUTBOUND_ECHO' });
    return { status: 'ignored_outbound' };
  }

  if (message.messageType !== 'TEXT' || !message.text) {
    await updateWatiMessageResolution(id, { processingStatus: 'NON_TEXT_UNHANDLED', intent: 'UNKNOWN' });
    return { status: 'ignored_non_text' };
  }

  const text = message.text;

  // Everything below is best-effort classification/response. It must not leave
  // this message permanently stuck in RECEIVED — a WATI retry would hit the
  // idempotency gate above and never get a second attempt at processing it.
  try {
    return await runResolutionAndResponse(id, message, text, payload, customerPhoneNormalized);
  } catch (error) {
    console.error('[wati.pipeline]', JSON.stringify({ event: 'processing_failed', error: error instanceof Error ? error.message : 'unknown' }));
    await updateWatiMessageResolution(id, { processingStatus: 'FAILED' }).catch(() => {});
    // Phase 14, brief sections 41/46 (non-negotiable "failure is visible, not
    // silent"): a customer whose message hit an unhandled error must never be
    // left with total silence. Best-effort only — a failure sending this
    // fallback must never throw again or affect the webhook's 200 contract,
    // and this never triggers a full Phase 8 handoff (that has its own DB
    // writes, which could be exactly what's failing).
    if (message.customerPhoneRaw) {
      await sendWatiTextGated(message.customerPhoneRaw, systemErrorFallback(), { conversationId: customerPhoneNormalized ?? message.customerPhoneRaw, category: 'SYSTEM_ERROR' }).catch(() => {});
    }
    return { status: 'failed' };
  }
}

async function runResolutionAndResponse(
  id: string,
  message: ReturnType<typeof normalizeWatiMessage>,
  text: string,
  payload: Record<string, unknown>,
  customerPhoneNormalized: string | null,
): Promise<PipelineOutcome> {
  // Phase 14, brief section 43: reused below (not just for rate-limiting) as
  // a cheap, already-computed "is this an active, ongoing conversation"
  // signal — `reserveWatiMessage` already inserted the current message
  // before this count runs, so `recentCount > 1` means at least one other
  // message from this phone landed in the last hour.
  let recentCount = 0;
  if (customerPhoneNormalized) {
    recentCount = await countRecentWatiMessages(customerPhoneNormalized, 60).catch(() => 0);
    if (recentCount > MAX_MESSAGES_PER_MINUTE) {
      console.warn('[wati.pipeline]', JSON.stringify({ event: 'rate_limited', phoneKey: customerPhoneNormalized, recentCount }));
      await updateWatiMessageResolution(id, { processingStatus: 'RATE_LIMITED' });
      return { status: 'rate_limited' };
    }
  }
  const isReturningConversation = isContextualGreetingEnabled() && recentCount > 1;

  // Brief section 9: a bare quantity reply ("20") to VIA's own "berapa yang
  // dibutuhkan?" question must attach to the existing NEEDS_QUANTITY inquiry,
  // never create a new one or fall through to generic intent detection (which
  // wouldn't know what to do with a bare number anyway).
  const followUp = await matchQuantityFollowUp(customerPhoneNormalized, text).catch(() => null);
  if (followUp) {
    return await continueStockWorkflowFromQuantity(id, message, followUp);
  }

  // Phase 6: a reply to VIA's own onboarding/identity/address question is not
  // a classifiable intent on its own — same short-circuit shape as the
  // quantity follow-up above, checked before generic intent detection.
  const earlyConversationId = customerPhoneNormalized || message.providerConversationId || message.providerMessageId;
  const commercialFollowUp = isCustomerIdentityMappingEnabled()
    ? await matchCommercialFollowUp(customerPhoneNormalized, earlyConversationId).catch(() => null)
    : null;
  if (commercialFollowUp) {
    return await continueCommercialFollowUp(id, message, text, commercialFollowUp);
  }

  // Phase 7: a reply to VIA's own "which account?"/"which order?" self-service
  // prompt is not a classifiable intent on its own — same short-circuit shape.
  const selfServicePending = isCustomerIdentityMappingEnabled() && customerPhoneNormalized
    ? await getPendingSelfService(customerPhoneNormalized).catch(() => null)
    : null;
  if (selfServicePending && message.customerPhoneRaw) {
    const resumed = await resumeSelfServiceAfterSelection({ normalizedPhone: customerPhoneNormalized!, text, conversationId: customerPhoneNormalized!, customerPhoneRaw: message.customerPhoneRaw, watiMessageId: id }).catch(() => null);
    if (resumed) {
      await updateWatiMessageResolution(id, { processingStatus: 'PROCESSED', intent: selfServicePending.intent, responseType: resumed.responseCase });
      let sent = false;
      if (resumed.responseText) {
        const result = await sendWatiTextGated(message.customerPhoneRaw, resumed.responseText, { conversationId: customerPhoneNormalized!, category: selfServicePending.intent });
        sent = result === 'sent';
      }
      return { status: 'processed', intent: selfServicePending.intent, responseCase: resumed.responseCase, sent };
    }
  }

  const [customerResult, conversationState, intentResult, channelMapping] = await Promise.all([
    message.customerPhoneRaw ? resolveCustomerByPhone(message.customerPhoneRaw) : Promise.resolve({ status: 'UNMATCHED' as const, customer: null, candidates: [] }),
    customerPhoneNormalized ? getConversationState(customerPhoneNormalized) : Promise.resolve('AUTO' as const),
    detectIntent(text),
    customerPhoneNormalized && isCustomerIdentityMappingEnabled() ? resolveCustomerIdentities(customerPhoneNormalized).catch(() => ({ status: 'NONE' as const })) : Promise.resolve({ status: 'NONE' as const }),
  ]);

  // Phase 11, brief section 15: best-effort, never awaited on the response
  // path — an opt-out phrase suppresses future proactive outreach without
  // affecting this turn's own reply.
  void checkInboundForOptOut(customerPhoneNormalized, text);

  const websiteProduct = parseWebsiteStructuredProduct(text);
  const source = resolveSource(payload, Boolean(websiteProduct) || intentResult.source === 'WEBSITE');
  const quantity = extractQuantity(text);

  const context = (!websiteProduct && !intentResult.productCodeCandidate)
    ? await resolveConversationContext(customerPhoneNormalized)
    : { carriedProductCode: null, carriedBrand: null };

  const productCandidate = websiteProduct?.productCode || intentResult.productCodeCandidate || context.carriedProductCode;
  const productResult = productCandidate
    ? await resolveProduct(productCandidate)
    : { status: 'NOT_FOUND' as const, item: null, brand: null, candidates: [] };

  const effectiveBrand = productResult.brand || intentResult.brand || context.carriedBrand;
  const conversationId = customerPhoneNormalized || message.providerConversationId || message.providerMessageId;
  // Brief section 3: built entirely from Phase 2/6's own server-side customer
  // resolution — never from message text, so nothing in `text` can change it.
  // Phase 6's mapping (channelMapping) takes priority over Phase 2's older
  // ad-hoc phone match when it resolves to exactly one customer (see
  // lib/security/disclosure/audience.ts's identity ladder).
  const channelIdentity = channelMapping.status === 'ONE'
    ? { customerId: channelMapping.mapping.customer_id, relationshipStatus: channelMapping.mapping.relationship_status === 'VERIFIED' ? 'VERIFIED' as const : 'UNVERIFIED' as const }
    : null;
  const audience = externalWatiAudience({ customerResolution: customerResult, externalPhone: message.customerPhoneRaw, conversationId, channelIdentity });

  const decision = decideResponse({
    intent: intentResult.intent,
    brand: effectiveBrand,
    productResolution: productCandidate ? productResult.status : null,
    product: productResult.item,
    productCodeCandidate: productCandidate,
    conversationSuppressed: conversationState === 'NEEDS_HUMAN' || conversationState === 'HUMAN_ASSIGNED' || conversationState === 'HUMAN_ACTIVE',
    isReturningConversation,
    audience,
    unsupportedScopeReason: intentResult.unsupportedScopeReason,
    commercialDraftEnabled: isCommercialDraftEnabled(),
    selfServiceFlags: {
      orderStatus: isCustomerOrderStatusEnabled(),
      invoiceStatus: isCustomerInvoiceStatusEnabled(),
      invoiceDocument: isCustomerInvoiceDocumentEnabled(),
      paymentStatus: isCustomerPaymentStatusEnabled(),
      receivableSummary: isCustomerReceivableSummaryEnabled(),
      deliveryStatus: isCustomerDeliveryStatusEnabled(),
    },
  });

  if (decision.case === 'H_DISCLOSURE_DENIED') {
    recordCustomerSecurityEvent({
      event: 'disclosure_decision',
      conversationId,
      category: intentResult.intent,
      decision: 'DENY',
      reasonCode: decision.disclosureReasonCode ?? 'UNKNOWN',
    });
  }

  // VIA Product/Pricing/Company Architecture brief section 94 — lightweight
  // observability, same console.info convention as every other event in this
  // pipeline. Never logs Tier/discount values (brief's explicit instruction).
  const COMPANY_KNOWLEDGE_EVENTS: Partial<Record<string, string>> = {
    O_COMPANY_INFO: 'company_knowledge.queried',
    P_DEALER_STATUS: 'company_knowledge.queried',
    Q_SHIPPING_POLICY: 'shipping_policy.queried',
    R_PAYMENT_DESTINATION: 'payment_destination.queried',
  };
  const companyKnowledgeEvent = COMPANY_KNOWLEDGE_EVENTS[decision.case];
  if (companyKnowledgeEvent) {
    console.info('[wati.pipeline]', JSON.stringify({ event: companyKnowledgeEvent, responseCase: decision.case }));
  }

  // Tracks whether THIS pipeline invocation is itself the one triggering a
  // handoff this turn (here, or later via startPriceInquiry's PRICE_NOT_FOUND
  // path) — the race-condition recheck before the final send must not
  // suppress a turn's own hand-off acknowledgement, only a genuinely
  // concurrent admin action (brief sections 76-77).
  let handoffTriggeredThisTurn = false;

  if (customerPhoneNormalized) {
    if (decision.markHumanRequest && isCustomerServiceHandoffEnabled()) {
      const reason: HandoffReason = decision.case === 'F_HUMAN' ? 'CUSTOMER_REQUESTED_HUMAN'
        : decision.case === 'M_DISCOUNT_HANDOFF' ? 'DISCOUNT_REQUEST'
        : 'OTHER_EXCEPTION';
      await triggerHandoff(customerPhoneNormalized, reason, { customerMessageText: text }).catch(error => {
        console.error('[wati.pipeline]', JSON.stringify({ event: 'handoff_trigger_failed', error: error instanceof Error ? error.message : 'unknown' }));
      });
      handoffTriggeredThisTurn = true;
    } else {
      await touchConversationState(customerPhoneNormalized, decision.markHumanRequest ? 'NEEDS_HUMAN' : undefined);
    }
  }

  let outboundText = decision.text;
  let responseCase: string = decision.case;

  if (decision.case === 'D_STOCK_ACK' && productResult.item) {
    const stockResult = await startStockInquiry(id, message, conversationId, customerResult.customer?.contact_id ?? null, productResult.item, effectiveBrand, text)
      .catch(error => {
        console.error('[wati.pipeline]', JSON.stringify({ event: 'stock_inquiry_create_failed', error: error instanceof Error ? error.message : 'unknown' }));
        return null;
      });
    if (stockResult) {
      outboundText = stockResult.responseText;
      responseCase = stockResult.responseCase;
    }
  }

  if (decision.case === 'I_PRICE_LOOKUP' && productResult.item) {
    const priceResult = await startPriceInquiry(id, message, conversationId, customerPhoneNormalized, customerResult.customer?.contact_id ?? null, productResult.item, effectiveBrand, intentResult.intent, text)
      .catch(error => {
        console.error('[wati.pipeline]', JSON.stringify({ event: 'price_lookup_failed', error: error instanceof Error ? error.message : 'unknown' }));
        return null;
      });
    if (priceResult) {
      outboundText = priceResult.responseText;
      responseCase = priceResult.responseCase;
      if (priceResult.responseCase === 'PRICE_NOT_FOUND') handoffTriggeredThisTurn = true;
    }
  }

  if (decision.case === 'K_COMMERCIAL_WORKFLOW' && (intentResult.intent === 'ORDER_INTENT' || intentResult.intent === 'QUOTATION_REQUEST' || intentResult.intent === 'ORDER_MODIFICATION' || intentResult.intent === 'ORDER_CANCELLATION_REQUEST')) {
    const commercialResult = await runCommercialWorkflow({
      inboundMessageId: id, message, conversationId, customerPhoneNormalized,
      intent: intentResult.intent, product: productResult.item, quantity, effectiveBrand, text,
    }).catch(error => {
      console.error('[wati.pipeline]', JSON.stringify({ event: 'commercial_workflow_failed', error: error instanceof Error ? error.message : 'unknown' }));
      return null;
    });
    if (commercialResult) {
      outboundText = commercialResult.responseText;
      responseCase = commercialResult.responseCase;
    }
  }

  if (decision.case === 'L_CUSTOMER_SELF_SERVICE' && customerPhoneNormalized && message.customerPhoneRaw) {
    const selfServiceResult = await runCustomerSelfService({
      intent: intentResult.intent, normalizedPhone: customerPhoneNormalized, conversationId,
      customerPhoneRaw: message.customerPhoneRaw, soNumberCandidate: intentResult.soNumberCandidate,
      invoiceNumberCandidate: intentResult.invoiceNumberCandidate, watiMessageId: id,
    }).catch(error => {
      console.error('[wati.pipeline]', JSON.stringify({ event: 'self_service_failed', error: error instanceof Error ? error.message : 'unknown' }));
      return null;
    });
    if (selfServiceResult) {
      outboundText = selfServiceResult.responseText;
      responseCase = selfServiceResult.responseCase;
    }
  }

  // Brief section 13/42: website-mismatch telemetry runs whenever a structured
  // website message carried a displayed price, independent of which intent
  // fired — internal-only, never changes what the customer is told.
  if (websiteProduct?.displayedPrice != null && productResult.status === 'EXACT' && productResult.item) {
    void checkAndLogWebsiteMismatch(productResult.item.item_id, productResult.item.sku ?? null, websiteProduct.displayedPrice, customerResult.customer?.contact_id ?? null);
  }

  // Brief sections 76-77: a human may take over between the decision above
  // and this send — re-check the live conversation state immediately before
  // sending and suppress a now-stale automated reply rather than racing the
  // admin's own message. Only relevant once handoff is actually enabled;
  // with the flag off, conversation state never advances past NEEDS_HUMAN
  // via this pipeline, so the pre-decision suppression check already covers it.
  let sent = false;
  if (outboundText && message.customerPhoneRaw) {
    // Skip the recheck when this exact turn is itself what triggered the
    // handoff — that acknowledgement is expected to send even though it's
    // the very thing transitioning the conversation to NEEDS_HUMAN, not a
    // race with a concurrent admin action.
    const staleSend = isCustomerServiceHandoffEnabled() && customerPhoneNormalized && !handoffTriggeredThisTurn
      ? await isNowHumanOwned(customerPhoneNormalized).catch(() => false)
      : false;
    if (staleSend) {
      console.warn('[wati.pipeline]', JSON.stringify({ event: 'auto_send_suppressed_race', conversationId }));
      outboundText = null;
      responseCase = 'SUPPRESSED_RACE';
    } else {
      const result = await sendWatiTextGated(message.customerPhoneRaw, outboundText, { conversationId, category: intentResult.intent });
      sent = result === 'sent';
    }
  }

  // Phase 14: this write happens AFTER the real customer-facing send above —
  // best-effort, same as every other post-send bookkeeping call in this file.
  // If this specific write throws (e.g. Supabase hiccup), it must never
  // propagate to the outer catch in processInboundWatiMessage, which would
  // otherwise send a confusing second "system error" fallback message to a
  // customer who already received their correct, real reply.
  await updateWatiMessageResolution(id, {
    processingStatus: 'PROCESSED',
    source,
    customerResolution: customerResult.status,
    customerId: customerResult.customer?.contact_id ?? null,
    intent: intentResult.intent,
    productResolution: productCandidate ? productResult.status : null,
    itemId: productResult.item?.item_id ?? null,
    itemCode: productResult.item?.sku ?? (productCandidate || null),
    brand: effectiveBrand,
    productName: productResult.item?.name ?? null,
    requestedQuantity: quantity?.quantity ?? null,
    requestedUnit: quantity?.unit ?? null,
    responseType: responseCase,
  }).catch(error => {
    console.error('[wati.pipeline]', JSON.stringify({ event: 'post_send_bookkeeping_failed', error: error instanceof Error ? error.message : 'unknown' }));
  });

  console.info('[wati.pipeline]', JSON.stringify({
    event: 'processed',
    intent: intentResult.intent,
    responseCase,
    productResolution: productCandidate ? productResult.status : null,
    customerResolution: customerResult.status,
    sent,
    textPreview: redact(text).slice(0, 80),
  }));

  if (isAnalyticsEventPipelineEnabled() && customerPhoneNormalized) {
    // Brief section 66: "New Lead" = first inbound contact with no verified
    // mapping at first contact — the dedupe key is keyed on phone alone
    // (never the message id), so only the very first inbound message from
    // an unmatched phone ever records this event, no matter how many later
    // messages arrive.
    if (customerResult.status === 'UNMATCHED') {
      void recordAnalyticsEvent({ eventType: 'lead.created', sourceId: customerPhoneNormalized, conversationId, source, channel: 'WATI' });
    }
    if (productCandidate && productResult.status === 'EXACT' && productResult.item) {
      void recordAnalyticsEvent({ eventType: 'product.inquiry', sourceId: id, conversationId, customerId: customerResult.customer?.contact_id ?? null, productId: productResult.item.item_id, source });
    }
    if (decision.case === 'D_STOCK_ACK') {
      void recordAnalyticsEvent({ eventType: 'stock.inquiry', sourceId: id, conversationId, customerId: customerResult.customer?.contact_id ?? null, productId: productResult.item?.item_id ?? null, source });
    }
    if (decision.case === 'I_PRICE_LOOKUP') {
      void recordAnalyticsEvent({ eventType: 'price.inquiry', sourceId: id, conversationId, customerId: customerResult.customer?.contact_id ?? null, productId: productResult.item?.item_id ?? null, source });
    }
  }

  return { status: 'processed', intent: intentResult.intent, responseCase, sent };
}

/** Type C (COUNT_INQUIRY) asks for quantity and stops; Type A/B create the inquiry and start the vendor-first check (brief section 8). */
async function startStockInquiry(
  inboundMessageId: string,
  message: ReturnType<typeof normalizeWatiMessage>,
  conversationId: string,
  customerId: string | null,
  product: NonNullable<Awaited<ReturnType<typeof resolveProduct>>['item']>,
  effectiveBrand: string | null,
  text: string,
): Promise<{ responseText: string | null; responseCase: string }> {
  const classification = classifyQuantityInquiry(text);

  if (classification.type === 'COUNT_INQUIRY') {
    await createStockInquiry({
      customerId,
      conversationId,
      customerPhoneRaw: message.customerPhoneRaw,
      inboundMessageId,
      itemId: product.item_id,
      itemCode: product.sku ?? null,
      brand: effectiveBrand,
      requestedQuantity: null,
      requestedUnit: null,
      status: 'NEEDS_QUANTITY',
      stockInquiryType: 'COUNT_INQUIRY',
    });
    return { responseText: needQuantityPrompt(), responseCase: 'STOCK_NEEDS_QUANTITY' };
  }

  const created = await createStockInquiry({
    customerId,
    conversationId,
    customerPhoneRaw: message.customerPhoneRaw,
    inboundMessageId,
    itemId: product.item_id,
    itemCode: product.sku ?? null,
    brand: effectiveBrand,
    requestedQuantity: classification.quantity?.quantity ?? null,
    requestedUnit: classification.quantity?.unit ?? null,
    stockInquiryType: classification.type,
  });

  const started = await startVendorCheck(created, product, effectiveBrand, classification.quantity?.quantity ?? null, classification.quantity?.unit ?? null);
  return { responseText: started.responseText, responseCase: `STOCK_${started.state}` };
}

/**
 * PRICE_INQUIRY: verified price only. STOCK_AND_PRICE_INQUIRY (brief section
 * 21): also runs the same vendor-first stock workflow as startStockInquiry,
 * combined into one message so the customer never has to ask twice — never
 * discloses a stock count either way (Phase 3 protection unchanged).
 */
async function startPriceInquiry(
  inboundMessageId: string,
  message: ReturnType<typeof normalizeWatiMessage>,
  conversationId: string,
  customerPhoneNormalized: string | null,
  customerId: string | null,
  product: NonNullable<Awaited<ReturnType<typeof resolveProduct>>['item']>,
  effectiveBrand: string | null,
  intent: string,
  text: string,
): Promise<{ responseText: string | null; responseCase: string }> {
  const price = await getCustomerSafePrice(product.item_id, customerId);
  if (price.sourceStatus !== 'VERIFIED') {
    if (customerPhoneNormalized) {
      if (isCustomerServiceHandoffEnabled()) {
        await triggerHandoff(customerPhoneNormalized, 'PRICE_NOT_FOUND').catch(() => {});
      } else {
        await touchConversationState(customerPhoneNormalized, 'NEEDS_HUMAN').catch(() => {});
      }
    }
    return { responseText: priceNotFound(), responseCase: 'PRICE_NOT_FOUND' };
  }
  const formattedPrice = formatIDR(price.amount);

  if (intent !== 'STOCK_AND_PRICE_INQUIRY') {
    return { responseText: priceOnly(product.sku ?? null, product.name, formattedPrice), responseCase: 'PRICE_VERIFIED' };
  }

  const classification = classifyQuantityInquiry(text);
  if (classification.type === 'COUNT_INQUIRY') {
    await createStockInquiry({
      customerId, conversationId, customerPhoneRaw: message.customerPhoneRaw, inboundMessageId,
      itemId: product.item_id, itemCode: product.sku ?? null, brand: effectiveBrand,
      requestedQuantity: null, requestedUnit: null, status: 'NEEDS_QUANTITY', stockInquiryType: 'COUNT_INQUIRY',
    });
    return { responseText: priceWithNeedQuantity(product.sku ?? null, product.name, formattedPrice), responseCase: 'PRICE_VERIFIED_STOCK_NEEDS_QUANTITY' };
  }

  const created = await createStockInquiry({
    customerId, conversationId, customerPhoneRaw: message.customerPhoneRaw, inboundMessageId,
    itemId: product.item_id, itemCode: product.sku ?? null, brand: effectiveBrand,
    requestedQuantity: classification.quantity?.quantity ?? null, requestedUnit: classification.quantity?.unit ?? null,
    stockInquiryType: classification.type,
  });
  const started = await startVendorCheck(created, product, effectiveBrand, classification.quantity?.quantity ?? null, classification.quantity?.unit ?? null);

  const responseText = started.state === 'WAITING_FOR_VENDOR'
    ? priceWithStockAck(product.sku ?? null, product.name, formattedPrice)
    : started.responseText
      ? `${priceOnly(product.sku ?? null, product.name, formattedPrice)}\n\n${started.responseText}`
      : priceOnly(product.sku ?? null, product.name, formattedPrice);
  return { responseText, responseCase: `PRICE_VERIFIED_STOCK_${started.state}` };
}

async function checkAndLogWebsiteMismatch(itemId: string, itemCode: string | null, websiteDisplayedPrice: number, customerId: string | null): Promise<void> {
  try {
    const price = await getCustomerSafePrice(itemId, customerId);
    if (price.sourceStatus !== 'VERIFIED') return;
    const result = checkWebsitePriceMismatch(websiteDisplayedPrice, price.amount);
    if (result) logWebsitePriceMismatch(itemCode, result);
  } catch (error) {
    console.warn('[wati.pricing]', JSON.stringify({ event: 'website_mismatch_check_failed', error: error instanceof Error ? error.message : 'unknown' }));
  }
}

/** Handles a bare quantity reply to VIA's own "berapa yang dibutuhkan?" question. */
async function continueStockWorkflowFromQuantity(
  inboundMessageId: string,
  message: ReturnType<typeof normalizeWatiMessage>,
  followUp: Awaited<ReturnType<typeof matchQuantityFollowUp>>,
): Promise<PipelineOutcome> {
  if (!followUp) return { status: 'failed' };
  const { inquiry, quantity, unit } = followUp;

  await updateWatiMessageResolution(inboundMessageId, {
    processingStatus: 'PROCESSED',
    intent: 'STOCK_CHECK',
    itemId: inquiry.item_id,
    itemCode: inquiry.item_code,
    brand: inquiry.brand,
    requestedQuantity: quantity,
    requestedUnit: unit,
    responseType: 'STOCK_QUANTITY_FOLLOW_UP',
  });

  if (!inquiry.item_id) {
    await updateStockInquiry(inquiry.id, { status: 'NEEDS_HUMAN', human_required: true });
    return { status: 'processed', intent: 'STOCK_CHECK', responseCase: 'STOCK_NEEDS_HUMAN' };
  }

  const product = await getItemDetail(inquiry.item_id);
  if (!product) {
    await updateStockInquiry(inquiry.id, { status: 'NEEDS_HUMAN', human_required: true });
    return { status: 'processed', intent: 'STOCK_CHECK', responseCase: 'STOCK_NEEDS_HUMAN' };
  }

  await updateStockInquiry(inquiry.id, { requested_quantity: quantity, requested_unit: unit });
  const started = await startVendorCheck({ id: inquiry.id, status: 'NEEDS_QUANTITY' }, product, inquiry.brand, quantity, unit);

  let sent = false;
  if (started.responseText && message.customerPhoneRaw) {
    const result = await sendWatiTextGated(message.customerPhoneRaw, started.responseText, { conversationId: inquiry.conversation_id, category: 'STOCK_CHECK' });
    sent = result === 'sent';
  }

  return { status: 'processed', intent: 'STOCK_CHECK', responseCase: `STOCK_${started.state}`, sent };
}

/** Handles a reply to VIA's own onboarding/identity/address question — Phase 6's equivalent of continueStockWorkflowFromQuantity. */
async function continueCommercialFollowUp(
  inboundMessageId: string,
  message: ReturnType<typeof normalizeWatiMessage>,
  text: string,
  followUp: NonNullable<Awaited<ReturnType<typeof matchCommercialFollowUp>>>,
): Promise<PipelineOutcome> {
  let result;
  let intentLabel: string;

  if (followUp.kind === 'ONBOARDING') {
    result = await continueOnboarding(followUp.customerDraftId, text);
    intentLabel = 'NEW_CUSTOMER_ONBOARDING';
  } else if (followUp.kind === 'CUSTOMER_SELECTION') {
    const phoneKey = followUp.draft.conversation_id ?? '';
    result = await resumeCustomerSelection(followUp.draft, phoneKey, text, message);
    intentLabel = 'CUSTOMER_IDENTITY_SELECTION';
  } else {
    result = await resumeAddressSelection(followUp.draft, text, message);
    intentLabel = 'DELIVERY_ADDRESS_SELECTION';
  }

  await updateWatiMessageResolution(inboundMessageId, { processingStatus: 'PROCESSED', intent: intentLabel, responseType: result.responseCase });

  let sent = false;
  if (result.responseText && message.customerPhoneRaw) {
    const sendResult = await sendWatiTextGated(message.customerPhoneRaw, result.responseText, { conversationId: followUp.kind === 'ONBOARDING' ? followUp.customerDraftId : followUp.draft.id, category: intentLabel });
    sent = sendResult === 'sent';
  }

  return { status: 'processed', intent: intentLabel, responseCase: result.responseCase, sent };
}

/** Brief sections 76-77's race-condition recheck: has this conversation become human-owned since the response decision was made? Exported for a direct unit test (Phase 13, brief section 56) — the full pipeline has no dedicated test file, so this is tested in isolation rather than through a heavily-mocked end-to-end run. */
export async function isNowHumanOwned(customerPhoneNormalized: string): Promise<boolean> {
  const current = await getServiceCase(customerPhoneNormalized);
  if (!current) return false;
  return current.state === 'NEEDS_HUMAN' || current.state === 'HUMAN_ASSIGNED' || current.state === 'HUMAN_ACTIVE';
}
