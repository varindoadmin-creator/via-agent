import assert from 'node:assert/strict';
import test from 'node:test';
import { decideResponse } from './responseDecision.ts';
import type { ZohoItem } from '../../../types/zoho.ts';
import { externalWatiAudience, type AudienceContext } from '../../security/disclosure/audience.ts';

const ITEM: ZohoItem = { item_id: '1', name: 'LAMITAK HPL MARMO CLASSICO PRO', sku: 'ATP11358M', rate: 0, status: 'active' };

const ANONYMOUS_AUDIENCE: AudienceContext = externalWatiAudience({ customerResolution: { status: 'UNMATCHED', customer: null }, externalPhone: '628123', conversationId: '628123' });

test('Case A: greeting gets the generic menu', () => {
  const decision = decideResponse({ intent: 'GREETING', brand: null, productResolution: null, product: null, productCodeCandidate: null, conversationSuppressed: false });
  assert.equal(decision.case, 'A_GREETING');
  assert.match(decision.text ?? '', /Cek Stok/);
});

test('Case B: brand inquiry without a resolved product does not ask which brand again', () => {
  const decision = decideResponse({ intent: 'PRODUCT_INQUIRY', brand: 'LAMITAK', productResolution: null, product: null, productCodeCandidate: null, conversationSuppressed: false });
  assert.equal(decision.case, 'B_BRAND_INQUIRY');
  assert.match(decision.text ?? '', /LAMITAK/);
  assert.doesNotMatch(decision.text ?? '', /brand mana|merek mana/i);
});

test('Case D: stock check acknowledgement never states a stock quantity and always opens a stock inquiry', () => {
  const decision = decideResponse({ intent: 'STOCK_CHECK', brand: null, productResolution: 'EXACT', product: ITEM, productCodeCandidate: 'ATP11358M', conversationSuppressed: false });
  assert.equal(decision.case, 'D_STOCK_ACK');
  assert.equal(decision.createStockInquiry, true);
  assert.doesNotMatch(decision.text ?? '', /\d+\s*(lembar|pcs|unit|stok tersedia)/i);
});

test('Case E: stock check with an unresolved product asks for clarification, never guesses', () => {
  const decision = decideResponse({ intent: 'STOCK_CHECK', brand: null, productResolution: null, product: null, productCodeCandidate: null, conversationSuppressed: false });
  assert.equal(decision.case, 'E_CLARIFICATION');
  assert.equal(decision.createStockInquiry, false);
});

test('Case F: human request always fires, even mid-suppression, and marks the conversation', () => {
  const decision = decideResponse({ intent: 'HUMAN_REQUEST', brand: null, productResolution: null, product: null, productCodeCandidate: null, conversationSuppressed: true });
  assert.equal(decision.case, 'F_HUMAN');
  assert.equal(decision.markHumanRequest, true);
});

test('Suppressed conversation sends no automated reply once a human has taken over', () => {
  const decision = decideResponse({ intent: 'STOCK_CHECK', brand: null, productResolution: 'EXACT', product: ITEM, productCodeCandidate: 'ATP11358M', conversationSuppressed: true });
  assert.equal(decision.case, 'SUPPRESSED');
  assert.equal(decision.text, null);
  assert.equal(decision.createStockInquiry, false);
});

test('Order inquiries never confirm an order (no order-creation capability exists)', () => {
  const orderDecision = decideResponse({ intent: 'ORDER_INQUIRY', brand: null, productResolution: null, product: null, productCodeCandidate: null, conversationSuppressed: false });
  assert.equal(orderDecision.case, 'G_ACK_ROUTE');
  assert.doesNotMatch(orderDecision.text ?? '', /Rp\.?\s*\d|disetujui|dikonfirmasi/i);
});

test('a price inquiry with no resolvable product or brand asks for clarification, never quotes a price', () => {
  const decision = decideResponse({ intent: 'PRICE_INQUIRY', brand: null, productResolution: null, product: null, productCodeCandidate: null, conversationSuppressed: false });
  assert.equal(decision.case, 'E_CLARIFICATION');
  assert.doesNotMatch(decision.text ?? '', /Rp\.?\s*\d/i);
});

// ─── Phase 4: disclosure-gated intents ──────────────────────────────────────

test('Test 2/14/16 — INTERNAL_METRIC_INQUIRY is denied with the internal-data template, no lookup attempted', () => {
  const decision = decideResponse({ intent: 'INTERNAL_METRIC_INQUIRY', brand: 'LAMITAK', productResolution: null, product: null, productCodeCandidate: null, conversationSuppressed: false, audience: ANONYMOUS_AUDIENCE });
  assert.equal(decision.case, 'H_DISCLOSURE_DENIED');
  assert.match(decision.text ?? '', /Mohon maaf/);
  assert.equal(decision.disclosureReasonCode, 'INTERNAL_DATA_EXTERNAL_DENIED');
  assert.equal(decision.createStockInquiry, false);
});

test('Test 8/19 — OTHER_CUSTOMER_INQUIRY is denied with the other-customer template', () => {
  const decision = decideResponse({ intent: 'OTHER_CUSTOMER_INQUIRY', brand: null, productResolution: null, product: null, productCodeCandidate: null, conversationSuppressed: false, audience: ANONYMOUS_AUDIENCE });
  assert.equal(decision.case, 'H_DISCLOSURE_DENIED');
  assert.match(decision.text ?? '', /pelanggan lain/);
});

test('Test 6/18 — ORDER_STATUS_INQUIRY with no real lookup capability hands off rather than denying flatly', () => {
  const decision = decideResponse({ intent: 'ORDER_STATUS_INQUIRY', brand: null, productResolution: null, product: null, productCodeCandidate: null, conversationSuppressed: false, audience: ANONYMOUS_AUDIENCE });
  assert.equal(decision.case, 'H_DISCLOSURE_DENIED');
  assert.match(decision.text ?? '', /verifikasi|Admin/i);
});

test('missing audience for a disclosure-gated intent fails closed rather than throwing', () => {
  const decision = decideResponse({ intent: 'INTERNAL_METRIC_INQUIRY', brand: null, productResolution: null, product: null, productCodeCandidate: null, conversationSuppressed: false });
  assert.equal(decision.case, 'H_DISCLOSURE_DENIED');
  assert.ok(decision.text && decision.text.length > 0);
});

test('a suppressed conversation (human takeover) still blocks the disclosure-gated intents, same as every other intent', () => {
  const decision = decideResponse({ intent: 'INTERNAL_METRIC_INQUIRY', brand: null, productResolution: null, product: null, productCodeCandidate: null, conversationSuppressed: true, audience: ANONYMOUS_AUDIENCE });
  assert.equal(decision.case, 'SUPPRESSED');
});

// ─── Phase 5: price intents ──────────────────────────────────────────────────

test('Test 49 — a resolved product with a price inquiry defers the actual text to the async pipeline lookup', () => {
  const decision = decideResponse({ intent: 'PRICE_INQUIRY', brand: null, productResolution: 'EXACT', product: ITEM, productCodeCandidate: 'ATP11358M', conversationSuppressed: false });
  assert.equal(decision.case, 'I_PRICE_LOOKUP');
  assert.equal(decision.text, null);
  assert.equal(decision.createStockInquiry, false);
});

test('Test 51/52 — STOCK_AND_PRICE_INQUIRY with a resolved product also defers to the pipeline (price+stock combined there)', () => {
  const decision = decideResponse({ intent: 'STOCK_AND_PRICE_INQUIRY', brand: null, productResolution: 'EXACT', product: ITEM, productCodeCandidate: 'ATP11358M', conversationSuppressed: false });
  assert.equal(decision.case, 'I_PRICE_LOOKUP');
});

test('Test 23 — a bare brand price question never invents a single brand-wide price', () => {
  const decision = decideResponse({ intent: 'PRICE_INQUIRY', brand: 'LAMITAK', productResolution: null, product: null, productCodeCandidate: null, conversationSuppressed: false });
  assert.equal(decision.case, 'J_BROAD_BRAND_PRICE');
  assert.doesNotMatch(decision.text ?? '', /Rp\.?\s*\d/);
});

test('Test 37/58 — a discount request always routes to human/Sales handoff and marks the conversation', () => {
  const decision = decideResponse({ intent: 'DISCOUNT_REQUEST', brand: null, productResolution: 'EXACT', product: ITEM, productCodeCandidate: 'ATP11358M', conversationSuppressed: false });
  assert.equal(decision.case, 'M_DISCOUNT_HANDOFF');
  assert.equal(decision.markHumanRequest, true);
  assert.doesNotMatch(decision.text ?? '', /\d/);
});

test('a suppressed conversation also blocks price and discount intents', () => {
  const priceDecision = decideResponse({ intent: 'PRICE_INQUIRY', brand: null, productResolution: 'EXACT', product: ITEM, productCodeCandidate: 'ATP11358M', conversationSuppressed: true });
  const discountDecision = decideResponse({ intent: 'DISCOUNT_REQUEST', brand: null, productResolution: null, product: null, productCodeCandidate: null, conversationSuppressed: true });
  assert.equal(priceDecision.case, 'SUPPRESSED');
  assert.equal(discountDecision.case, 'SUPPRESSED');
});

// ─── Phase 6: commercial-intent cases ───────────────────────────────────────

test('Test 77 — ORDER_INTENT with a resolved product defers to the pipeline workflow, never confirms a Zoho write here', () => {
  const decision = decideResponse({ intent: 'ORDER_INTENT', brand: null, productResolution: 'EXACT', product: ITEM, productCodeCandidate: 'ATP11358M', conversationSuppressed: false });
  assert.equal(decision.case, 'K_COMMERCIAL_WORKFLOW');
  assert.equal(decision.text, null);
});

test('QUOTATION_REQUEST with an unresolved product asks for clarification, never starts a draft blind', () => {
  const decision = decideResponse({ intent: 'QUOTATION_REQUEST', brand: null, productResolution: null, product: null, productCodeCandidate: null, conversationSuppressed: false });
  assert.equal(decision.case, 'E_CLARIFICATION');
});

test('ORDER_MODIFICATION and ORDER_CANCELLATION_REQUEST both defer to the pipeline workflow', () => {
  const mod = decideResponse({ intent: 'ORDER_MODIFICATION', brand: null, productResolution: null, product: null, productCodeCandidate: null, conversationSuppressed: false });
  const cancel = decideResponse({ intent: 'ORDER_CANCELLATION_REQUEST', brand: null, productResolution: null, product: null, productCodeCandidate: null, conversationSuppressed: false });
  assert.equal(mod.case, 'K_COMMERCIAL_WORKFLOW');
  assert.equal(cancel.case, 'K_COMMERCIAL_WORKFLOW');
});

test('a suppressed conversation also blocks commercial-intent cases', () => {
  const decision = decideResponse({ intent: 'ORDER_INTENT', brand: null, productResolution: 'EXACT', product: ITEM, productCodeCandidate: 'ATP11358M', conversationSuppressed: true });
  assert.equal(decision.case, 'SUPPRESSED');
});

test('Section 80 — when COMMERCIAL_DRAFT_ENABLED is off, commercial intents fall back to the pre-Phase-6 ack/route handoff instead of starting a draft', () => {
  const order = decideResponse({ intent: 'ORDER_INTENT', brand: null, productResolution: 'EXACT', product: ITEM, productCodeCandidate: 'ATP11358M', conversationSuppressed: false, commercialDraftEnabled: false });
  const cancel = decideResponse({ intent: 'ORDER_CANCELLATION_REQUEST', brand: null, productResolution: null, product: null, productCodeCandidate: null, conversationSuppressed: false, commercialDraftEnabled: false });
  assert.equal(order.case, 'G_ACK_ROUTE');
  assert.equal(cancel.case, 'G_ACK_ROUTE');
});

// ─── Phase 7: customer self-service ──────────────────────────────────────────

const MATCHED_AUDIENCE: AudienceContext = { ...ANONYMOUS_AUDIENCE, customerId: 'CUST-1', identityLevel: 'CUSTOMER_MATCHED' };
const VERIFIED_AUDIENCE: AudienceContext = { ...ANONYMOUS_AUDIENCE, customerId: 'CUST-1', identityLevel: 'VERIFIED_CUSTOMER' };

test('Test 65 — a CUSTOMER_MATCHED audience clears the bar for order-status self-service', () => {
  const decision = decideResponse({ intent: 'ORDER_STATUS_INQUIRY', brand: null, productResolution: null, product: null, productCodeCandidate: null, conversationSuppressed: false, audience: MATCHED_AUDIENCE });
  assert.equal(decision.case, 'L_CUSTOMER_SELF_SERVICE');
  assert.equal(decision.text, null);
});

test('an ANONYMOUS audience (no Phase 6 mapping at all) is denied self-service, never exposes any order data', () => {
  const decision = decideResponse({ intent: 'ORDER_STATUS_INQUIRY', brand: null, productResolution: null, product: null, productCodeCandidate: null, conversationSuppressed: false, audience: ANONYMOUS_AUDIENCE });
  assert.equal(decision.case, 'H_DISCLOSURE_DENIED');
});

test('Test 15/16 — invoice document requires VERIFIED_CUSTOMER; CUSTOMER_MATCHED alone is insufficient and asks to verify', () => {
  const matchedOnly = decideResponse({ intent: 'INVOICE_DOCUMENT_REQUEST', brand: null, productResolution: null, product: null, productCodeCandidate: null, conversationSuppressed: false, audience: MATCHED_AUDIENCE });
  assert.equal(matchedOnly.case, 'H_DISCLOSURE_DENIED');
  assert.match(matchedOnly.text ?? '', /verifikasi/i);

  const verified = decideResponse({ intent: 'INVOICE_DOCUMENT_REQUEST', brand: null, productResolution: null, product: null, productCodeCandidate: null, conversationSuppressed: false, audience: VERIFIED_AUDIENCE });
  assert.equal(verified.case, 'L_CUSTOMER_SELF_SERVICE');
});

test('Section 76 — a disabled self-service flag falls back to a generic ack, never an error', () => {
  const decision = decideResponse({ intent: 'PAYMENT_STATUS', brand: null, productResolution: null, product: null, productCodeCandidate: null, conversationSuppressed: false, audience: MATCHED_AUDIENCE, selfServiceFlags: { paymentStatus: false } });
  assert.equal(decision.case, 'G_ACK_ROUTE');
});

test('all remaining self-service intents (history, last order, delivery, invoice status, outstanding, receivable summary) clear the same CUSTOMER_MATCHED bar', () => {
  for (const intent of ['ORDER_HISTORY', 'LAST_ORDER', 'DELIVERY_STATUS', 'INVOICE_STATUS', 'OUTSTANDING_INVOICES', 'RECEIVABLE_SUMMARY'] as const) {
    const decision = decideResponse({ intent, brand: null, productResolution: null, product: null, productCodeCandidate: null, conversationSuppressed: false, audience: MATCHED_AUDIENCE });
    assert.equal(decision.case, 'L_CUSTOMER_SELF_SERVICE', `expected ${intent} to clear the bar`);
  }
});

test('a suppressed conversation also blocks every self-service intent', () => {
  const decision = decideResponse({ intent: 'ORDER_STATUS_INQUIRY', brand: null, productResolution: null, product: null, productCodeCandidate: null, conversationSuppressed: true, audience: MATCHED_AUDIENCE });
  assert.equal(decision.case, 'SUPPRESSED');
});
