// ─── Commercial draft workflow orchestration ─────────────────────────────────
// Brief sections 5, 22-30, 31-40: resolves customer identity -> delivery
// address -> product/quantity (already resolved by pipeline.ts, Phase 2) ->
// price (Phase 5) -> stock (Phase 3, status-only) -> READY_FOR_REVIEW. No
// Zoho write happens here — this only ever prepares a CommercialDraft for
// lib/commercialApprovals/executeCommercialDraft.ts to execute after an
// explicit internal approval.
//
// Scope note (documented in the Phase 6 report's known limitations): this
// pass handles exactly one product line per draft, matching every one of the
// brief's own numbered test scenarios (sections 70-79), which are all
// single-line. The product/quantity from the message that started the draft
// is carried as "pending_*" fields on the draft row itself (not yet a
// materialized CommercialDraftLine) so that a later identity/address
// SELECTION reply — which doesn't repeat the product — can resume exactly
// what was originally asked for. Multi-line orders and true
// partial-availability sequencing (section 51) are deferred.

import type { ZohoItem } from '../../../../types/zoho.ts';
import type { NormalizedWatiMessage } from '../message.ts';
import { resolveCustomerIdentities, createChannelIdentity } from '../../../customerIdentity/channelIdentity.ts';
import { matchExistingCustomer } from '../../../customerIdentity/matching.ts';
import { getAllCustomers, getCustomerById, getCustomerAddresses } from '../../../zoho/customers.ts';
import { findActiveCustomerDraft, createCustomerDraft, updateCustomerDraft, getCustomerDraft } from '../../../customerIdentity/customerDraft.ts';
import { processOnboardingReply, startOnboardingQuestion } from '../../../customerIdentity/onboarding.ts';
import { checkForDuplicateCustomer } from '../../../customerIdentity/duplicateCheck.ts';
import { isNewCustomerOnboardingEnabled } from '../../../customerIdentity/featureFlags.ts';
import {
  createCommercialDraft, findActiveDraftForConversation, updateCommercialDraft,
  upsertDraftLine, getDraftLines, deriveStockStatusFromInquiry,
  type CommercialDraft, type CommercialDraftType,
} from './draft.ts';
import { resolveDeliveryAddress, matchAddressFreeText } from './addressResolution.ts';
import { getCustomerSafePrice } from '../pricing/customerSafePrice.ts';
import { formatIDR } from '../../../zoho/tax.ts';
import { classifyQuantityInquiry } from '../stock/quantityInquiryType.ts';
import { createStockInquiry } from '../stockInquiries.ts';
import { startVendorCheck } from '../stock/service.ts';
import { getStockInquiry } from '../stock/store.ts';
import {
  askWhichCustomer, askWhichAddress, askForDeliveryAddress, customerPossibleDuplicateHandoff,
  orderReadyForReview, quotationReadyForReview, commercialNeedsHumanNoPhone, onboardingReadyForReviewAck,
  orderCancellationNoActiveDraft, orderCancellationConfirmed, orderCancellationNeedsHuman,
  orderModificationApplied, orderModificationNeedsHuman,
} from './responses.ts';
import { needQuantityPrompt } from '../stock/responses.ts';
import { priceNotFound } from '../pricing/responses.ts';

export interface CommercialWorkflowResult {
  responseText: string | null;
  responseCase: string;
}

export interface CommercialWorkflowInput {
  inboundMessageId: string;
  message: NormalizedWatiMessage;
  conversationId: string;
  customerPhoneNormalized: string | null;
  intent: 'ORDER_INTENT' | 'QUOTATION_REQUEST' | 'ORDER_MODIFICATION' | 'ORDER_CANCELLATION_REQUEST';
  product: ZohoItem | null;
  quantity: { quantity: number; unit: string | null } | null;
  effectiveBrand: string | null;
  text: string;
}

const draftTypeForIntent = (intent: string): CommercialDraftType => intent === 'QUOTATION_REQUEST' ? 'QUOTATION' : 'SALES_ORDER';

export async function runCommercialWorkflow(input: CommercialWorkflowInput): Promise<CommercialWorkflowResult> {
  if (!input.customerPhoneNormalized || !input.message.customerPhoneRaw) {
    return { responseText: commercialNeedsHumanNoPhone(), responseCase: 'COMMERCIAL_NEEDS_HUMAN_NO_PHONE' };
  }
  if (input.intent === 'ORDER_CANCELLATION_REQUEST') return handleCancellation(input.conversationId);
  if (input.intent === 'ORDER_MODIFICATION') return handleModification(input);
  if (!input.product) {
    return { responseText: null, responseCase: 'COMMERCIAL_NO_PRODUCT' }; // Case E clarification already sent by the generic decision path.
  }

  const draftType = draftTypeForIntent(input.intent);
  let draft = await findActiveDraftForConversation(input.conversationId);
  if (!draft) {
    draft = await createCommercialDraft({ type: draftType, conversationId: input.conversationId, sourceMessageId: input.inboundMessageId });
    draft = await updateCommercialDraft(draft.id, draft.version, {
      pending_product_id: input.product.item_id, pending_item_code: input.product.sku ?? null, pending_product_name: input.product.name,
      pending_quantity: input.quantity?.quantity ?? null, pending_unit: input.quantity?.unit ?? null,
      pending_brand: input.effectiveBrand, pending_source_message_id: input.inboundMessageId,
    });
  }

  return advanceDraft(draft, input.customerPhoneNormalized, input.message, input.text);
}

/** Drives a draft forward from wherever it currently sits: customer -> address -> price/quantity -> stock -> READY_FOR_REVIEW. */
async function advanceDraft(draft: CommercialDraft, normalizedPhone: string, message: NormalizedWatiMessage, text: string): Promise<CommercialWorkflowResult> {
  // ─── Step 1: customer identity (brief section 5) — never re-ask within an active draft ───
  if (!draft.customer_id) {
    const identityResult = await resolveIdentityForDraft(normalizedPhone);
    if (identityResult.kind === 'RESOLVED') {
      draft = await updateCommercialDraft(draft.id, draft.version, { customer_id: identityResult.customerId, status: 'NEEDS_PRODUCT' });
    } else if (identityResult.kind === 'ASK') {
      draft = await updateCommercialDraft(draft.id, draft.version, { status: 'NEEDS_CUSTOMER' });
      return { responseText: askWhichCustomer(identityResult.options.map(o => o.label)), responseCase: 'COMMERCIAL_ASK_CUSTOMER' };
    } else if (identityResult.kind === 'ONBOARDING') {
      await updateCommercialDraft(draft.id, draft.version, { status: 'CUSTOMER_ONBOARDING', customer_draft_id: identityResult.customerDraftId });
      return { responseText: identityResult.question, responseCase: 'COMMERCIAL_ONBOARDING_STARTED' };
    } else {
      return { responseText: customerPossibleDuplicateHandoff(), responseCase: 'COMMERCIAL_POSSIBLE_DUPLICATE_HUMAN' };
    }
  }

  const customerId = draft.customer_id;
  if (!customerId) throw new Error('unreachable: customer_id must be set past this point');

  // ─── Step 2: delivery address (brief sections 23-30) ───
  if (!draft.delivery_address_id && !draft.proposed_delivery_address) {
    const addresses = await getCustomerAddresses(customerId);
    const resolution = resolveDeliveryAddress(addresses);
    if (resolution.status === 'AUTO_SELECTED') {
      draft = await updateCommercialDraft(draft.id, draft.version, { delivery_address_id: resolution.address.address_id ?? resolution.address.address, status: 'NEEDS_PRODUCT' });
    } else if (resolution.status === 'ASK') {
      draft = await updateCommercialDraft(draft.id, draft.version, { status: 'NEEDS_DELIVERY_INFO' });
      return { responseText: askWhichAddress(addresses.map(a => a.attention || a.address)), responseCase: 'COMMERCIAL_ASK_ADDRESS' };
    } else {
      const looksLikeAnAddress = text.trim().length >= 8;
      if (looksLikeAnAddress) {
        draft = await updateCommercialDraft(draft.id, draft.version, { proposed_delivery_address: { address: text.trim() }, status: 'NEEDS_PRODUCT' });
      } else {
        draft = await updateCommercialDraft(draft.id, draft.version, { status: 'NEEDS_DELIVERY_INFO' });
        return { responseText: askForDeliveryAddress(), responseCase: 'COMMERCIAL_ASK_DELIVERY_ADDRESS' };
      }
    }
  }

  return finalizeDraft(draft, message);
}

/** Once customer + delivery address are known: price, then stock, then READY_FOR_REVIEW. */
async function finalizeDraft(draft: CommercialDraft, message: NormalizedWatiMessage): Promise<CommercialWorkflowResult> {
  const customerId = draft.customer_id;
  const productId = draft.pending_product_id;
  const quantity = draft.pending_quantity;
  if (!customerId || !productId) return { responseText: commercialNeedsHumanNoPhone(), responseCase: 'COMMERCIAL_INCOMPLETE_STATE' };
  if (!quantity) return { responseText: needQuantityPrompt(), responseCase: 'COMMERCIAL_NEEDS_QUANTITY' };

  const price = await getCustomerSafePrice(productId, customerId);
  if (price.sourceStatus !== 'VERIFIED') {
    await updateCommercialDraft(draft.id, draft.version, { status: 'NEEDS_PRICE' }).catch(() => undefined);
    return { responseText: priceNotFound(), responseCase: 'COMMERCIAL_PRICE_NOT_FOUND' };
  }

  const itemCode = draft.pending_item_code;
  const unit = draft.pending_unit;
  const brand = draft.pending_brand;
  const productName = draft.pending_product_name ?? itemCode ?? productId;
  const sourceMessageId = draft.pending_source_message_id ?? draft.id;

  const classification = classifyQuantityInquiry(`${quantity} ${unit ?? ''}`.trim());
  const created = await createStockInquiry({
    customerId, conversationId: draft.conversation_id ?? draft.id, customerPhoneRaw: message.customerPhoneRaw, inboundMessageId: sourceMessageId,
    itemId: productId, itemCode, brand,
    requestedQuantity: quantity, requestedUnit: unit, stockInquiryType: classification.type,
  });
  const fauxProduct = { item_id: productId, sku: itemCode ?? undefined, name: productName, rate: 0, status: 'active' as const };
  await startVendorCheck(created, fauxProduct, brand, quantity, unit).catch(() => undefined);

  const total = price.amount * quantity;
  await upsertDraftLine({
    draftId: draft.id, lineOrder: 0, productId, itemCode, productName,
    quantity, unit, approvedUnitPrice: price.amount, stockStatus: 'PENDING',
    stockInquiryId: created.id, sourceMessageId,
  });

  const updatedDraft = await updateCommercialDraft(draft.id, draft.version, { status: 'READY_FOR_REVIEW', subtotal: total, tax: 0, total, currency: price.currency });

  const itemLabel = itemCode ? `${itemCode} - ${productName}` : productName;
  const formattedTotal = formatIDR(total);
  const responseText = updatedDraft.type === 'QUOTATION'
    ? quotationReadyForReview(itemLabel, quantity, unit, formattedTotal)
    : orderReadyForReview(itemLabel, quantity, unit, formattedTotal);
  return { responseText, responseCase: 'COMMERCIAL_READY_FOR_REVIEW' };
}

type IdentityResolutionOutcome =
  | { kind: 'RESOLVED'; customerId: string }
  | { kind: 'ASK'; options: Array<{ customerId: string; label: string }> }
  | { kind: 'ONBOARDING'; customerDraftId: string; question: string }
  | { kind: 'POSSIBLE_DUPLICATE' };

async function resolveIdentityForDraft(normalizedPhone: string): Promise<IdentityResolutionOutcome> {
  const mapping = await resolveCustomerIdentities(normalizedPhone);
  if (mapping.status === 'ONE') return { kind: 'RESOLVED', customerId: mapping.mapping.customer_id };
  if (mapping.status === 'MANY') {
    const labeled = await Promise.all(mapping.mappings.map(async m => {
      const customer = await getCustomerById(m.customer_id);
      return { customerId: m.customer_id, label: customer?.company_name || customer?.contact_name || m.customer_id };
    }));
    return { kind: 'ASK', options: labeled };
  }

  // NONE — resume an in-progress onboarding draft if one exists (brief section 6-7).
  const existingDraft = await findActiveCustomerDraft(normalizedPhone);
  if (existingDraft) return { kind: 'ONBOARDING', customerDraftId: existingDraft.id, question: startOnboardingQuestion() };

  // Deterministic phone-only match against Zoho's own customer records (brief section 5C).
  const allCustomers = await getAllCustomers();
  const match = matchExistingCustomer({ phone: normalizedPhone }, allCustomers);
  if (match.outcome === 'EXACT_MATCH') {
    const customer = match.candidates[0];
    await createChannelIdentity({ normalizedPhone, customerId: customer.contact_id, source: 'ZOHO_CONTACT_MATCH', relationshipStatus: 'VERIFIED' });
    return { kind: 'RESOLVED', customerId: customer.contact_id };
  }
  if (match.outcome === 'POSSIBLE_MATCH') return { kind: 'POSSIBLE_DUPLICATE' };

  if (!isNewCustomerOnboardingEnabled()) return { kind: 'POSSIBLE_DUPLICATE' }; // Stage 1 not yet enabled — route to human rather than starting a draft (brief section 80: don't enable all writes at once).

  const newDraft = await createCustomerDraft({ normalizedPhone, conversationId: normalizedPhone });
  return { kind: 'ONBOARDING', customerDraftId: newDraft.id, question: startOnboardingQuestion() };
}

/** Resumes a NEEDS_CUSTOMER draft once the customer answers the "which account" prompt. Never accepts an arbitrary customer ID from text (brief section 63) — only a numbered choice among the mappings already resolved for this exact phone. */
export async function resumeCustomerSelection(draft: CommercialDraft, normalizedPhone: string, text: string, message: NormalizedWatiMessage): Promise<CommercialWorkflowResult> {
  const mapping = await resolveCustomerIdentities(normalizedPhone);
  if (mapping.status !== 'MANY') return { responseText: null, responseCase: 'COMMERCIAL_SELECTION_STALE' };
  const labeled = await Promise.all(mapping.mappings.map(async m => {
    const customer = await getCustomerById(m.customer_id);
    return { customerId: m.customer_id, label: (customer?.company_name || customer?.contact_name || m.customer_id).toLowerCase() };
  }));
  const choiceIndex = parseInt(text.trim(), 10) - 1;
  const byNumber = Number.isInteger(choiceIndex) ? labeled[choiceIndex] : undefined;
  const byName = labeled.find(o => text.toLowerCase().includes(o.label));
  const selected = byNumber || byName;
  if (!selected) return { responseText: askWhichCustomer(labeled.map(o => o.label)), responseCase: 'COMMERCIAL_ASK_CUSTOMER_RETRY' };

  const updated = await updateCommercialDraft(draft.id, draft.version, { customer_id: selected.customerId, status: 'NEEDS_PRODUCT' });
  return finalizeAfterSelection(updated, message);
}

/** Resumes a NEEDS_DELIVERY_INFO draft once the customer answers the "which address" prompt. Only matches against the resolved customer's own addresses (brief sections 29-30, 64). */
export async function resumeAddressSelection(draft: CommercialDraft, text: string, message: NormalizedWatiMessage): Promise<CommercialWorkflowResult> {
  if (!draft.customer_id) return { responseText: null, responseCase: 'COMMERCIAL_SELECTION_STALE' };
  // Scoped to this exact customer by construction — any match from this list
  // inherently satisfies brief section 29/64's ownership check.
  const addresses = await getCustomerAddresses(draft.customer_id);
  const choiceIndex = parseInt(text.trim(), 10) - 1;
  const byNumber = Number.isInteger(choiceIndex) && choiceIndex >= 0 ? addresses[choiceIndex] : undefined;
  const freeText = matchAddressFreeText(text, addresses);
  const selected = byNumber ?? (freeText.outcome === 'EXACT' ? freeText.address : undefined);
  if (!selected) {
    return { responseText: askWhichAddress(addresses.map(a => a.attention || a.address)), responseCase: 'COMMERCIAL_ASK_ADDRESS_RETRY' };
  }
  const updated = await updateCommercialDraft(draft.id, draft.version, { delivery_address_id: selected.address_id ?? selected.address, status: 'NEEDS_PRODUCT' });
  return finalizeDraft(updated, message);
}

async function finalizeAfterSelection(draft: CommercialDraft, message: NormalizedWatiMessage): Promise<CommercialWorkflowResult> {
  return advanceDraft(draft, draft.conversation_id ?? '', message, '');
}

/**
 * Continues an in-progress New Customer Onboarding conversation (brief
 * sections 6-7). Called by pipeline.ts's follow-up check before generic
 * intent detection, same pattern as the existing stock quantity follow-up —
 * an onboarding reply ("PT Contoh Jaya", "Ya", an address) is not a
 * classifiable intent on its own.
 */
export async function continueOnboarding(customerDraftId: string, text: string): Promise<CommercialWorkflowResult> {
  const draft = await getCustomerDraft(customerDraftId);
  if (!draft) return { responseText: null, responseCase: 'CUSTOMER_ONBOARDING_DRAFT_MISSING' };

  const step = processOnboardingReply(draft, text);
  const updated = await updateCustomerDraft(draft.id, draft.version, { status: step.nextStatus, ...step.patch });
  if (!step.done) return { responseText: step.question, responseCase: 'CUSTOMER_ONBOARDING_QUESTION' };

  const allCustomers = await getAllCustomers();
  const dup = checkForDuplicateCustomer({ companyName: updated.company_name, npwp: updated.npwp, phone: updated.normalized_phone }, allCustomers);
  if (dup.status === 'NO_DUPLICATE') {
    await updateCustomerDraft(updated.id, updated.version, { status: 'READY_FOR_REVIEW', duplicate_check_status: 'NO_DUPLICATE' });
    return { responseText: onboardingReadyForReviewAck(), responseCase: 'CUSTOMER_ONBOARDING_READY_FOR_REVIEW' };
  }
  await updateCustomerDraft(updated.id, updated.version, { status: 'POSSIBLE_DUPLICATE', duplicate_check_status: dup.status, duplicate_candidate_customer_ids: dup.candidateCustomerIds });
  return { responseText: customerPossibleDuplicateHandoff(), responseCase: 'CUSTOMER_ONBOARDING_POSSIBLE_DUPLICATE' };
}

async function handleCancellation(conversationId: string): Promise<CommercialWorkflowResult> {
  const draft = await findActiveDraftForConversation(conversationId);
  if (!draft) return { responseText: orderCancellationNoActiveDraft(), responseCase: 'COMMERCIAL_CANCEL_NONE_ACTIVE' };
  if (draft.status === 'APPROVED' || draft.status === 'EXECUTING' || draft.status === 'COMPLETED') {
    return { responseText: orderCancellationNeedsHuman(), responseCase: 'COMMERCIAL_CANCEL_NEEDS_HUMAN' };
  }
  await updateCommercialDraft(draft.id, draft.version, { status: 'CANCELLED' });
  return { responseText: orderCancellationConfirmed(), responseCase: 'COMMERCIAL_CANCELLED' };
}

async function handleModification(input: CommercialWorkflowInput): Promise<CommercialWorkflowResult> {
  const draft = await findActiveDraftForConversation(input.conversationId);
  if (!draft || !input.quantity) return { responseText: orderCancellationNoActiveDraft(), responseCase: 'COMMERCIAL_MODIFY_NONE_ACTIVE' };
  // Brief section 53: no automatic modification once Zoho already has the object.
  if (draft.status === 'APPROVED' || draft.status === 'EXECUTING' || draft.status === 'COMPLETED') {
    return { responseText: orderModificationNeedsHuman(), responseCase: 'COMMERCIAL_MODIFY_NEEDS_HUMAN' };
  }
  const lines = await getDraftLines(draft.id);
  const line = lines[0];
  if (!line || !draft.customer_id) return { responseText: orderCancellationNoActiveDraft(), responseCase: 'COMMERCIAL_MODIFY_NONE_ACTIVE' };

  const price = await getCustomerSafePrice(line.product_id, draft.customer_id);
  const unitPrice = price.sourceStatus === 'VERIFIED' ? price.amount : (line.approved_unit_price ?? 0);
  const total = unitPrice * input.quantity.quantity;

  // Brief section 12/43: any material change invalidates the prior approval —
  // updateCommercialDraft's version bump handles this structurally.
  await updateCommercialDraft(draft.id, draft.version, { status: 'READY_FOR_REVIEW', subtotal: total, tax: 0, total });
  const itemLabel = line.item_code ? `${line.item_code} - ${line.product_name}` : line.product_name;
  return { responseText: orderModificationApplied(itemLabel, input.quantity.quantity, input.quantity.unit), responseCase: 'COMMERCIAL_MODIFIED' };
}

/** Used by the admin dashboard to derive current stock status from the linked stock inquiry without duplicating the vendor-check state machine. */
export async function refreshLineStockStatus(stockInquiryId: string) {
  const inquiry = await getStockInquiry(stockInquiryId);
  return deriveStockStatusFromInquiry(inquiry?.final_availability ?? null);
}
