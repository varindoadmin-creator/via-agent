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
import { decideResponse } from './responseDecision.ts';
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
  if (customerPhoneNormalized) {
    const recentCount = await countRecentWatiMessages(customerPhoneNormalized, 60).catch(() => 0);
    if (recentCount > MAX_MESSAGES_PER_MINUTE) {
      console.warn('[wati.pipeline]', JSON.stringify({ event: 'rate_limited', phoneKey: customerPhoneNormalized, recentCount }));
      await updateWatiMessageResolution(id, { processingStatus: 'RATE_LIMITED' });
      return { status: 'rate_limited' };
    }
  }

  // Brief section 9: a bare quantity reply ("20") to VIA's own "berapa yang
  // dibutuhkan?" question must attach to the existing NEEDS_QUANTITY inquiry,
  // never create a new one or fall through to generic intent detection (which
  // wouldn't know what to do with a bare number anyway).
  const followUp = await matchQuantityFollowUp(customerPhoneNormalized, text).catch(() => null);
  if (followUp) {
    return await continueStockWorkflowFromQuantity(id, message, followUp);
  }

  const [customerResult, conversationState, intentResult] = await Promise.all([
    message.customerPhoneRaw ? resolveCustomerByPhone(message.customerPhoneRaw) : Promise.resolve({ status: 'UNMATCHED' as const, customer: null, candidates: [] }),
    customerPhoneNormalized ? getConversationState(customerPhoneNormalized) : Promise.resolve('AUTO' as const),
    detectIntent(text),
  ]);

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
  // Brief section 3: built entirely from Phase 2's own server-side customer
  // resolution — never from message text, so nothing in `text` can change it.
  const audience = externalWatiAudience({ customerResolution: customerResult, externalPhone: message.customerPhoneRaw, conversationId });

  const decision = decideResponse({
    intent: intentResult.intent,
    brand: effectiveBrand,
    productResolution: productCandidate ? productResult.status : null,
    product: productResult.item,
    productCodeCandidate: productCandidate,
    conversationSuppressed: conversationState === 'NEEDS_HUMAN' || conversationState === 'HUMAN_ACTIVE',
    audience,
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

  if (customerPhoneNormalized) {
    await touchConversationState(customerPhoneNormalized, decision.markHumanRequest ? 'NEEDS_HUMAN' : undefined);
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

  let sent = false;
  if (outboundText && message.customerPhoneRaw) {
    const result = await sendWatiTextGated(message.customerPhoneRaw, outboundText, { conversationId, category: intentResult.intent });
    sent = result === 'sent';
  }

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
