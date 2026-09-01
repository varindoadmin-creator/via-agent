import assert from 'node:assert/strict';
import test from 'node:test';
import { decideResponse } from './responseDecision.ts';
import type { ZohoItem } from '../../../types/zoho.ts';
import { externalWatiAudience, type AudienceContext } from '../../security/disclosure/audience.ts';

const ITEM: ZohoItem = { item_id: '1', name: 'LAMITAK HPL MARMO CLASSICO PRO', sku: 'ATP11358M', rate: 0, status: 'active' };

const ANONYMOUS_AUDIENCE: AudienceContext = externalWatiAudience({ customerResolution: { status: 'UNMATCHED', customer: null }, externalPhone: '628123', conversationId: '628123' });

test('Case A: greeting invites an open-ended request rather than a numbered menu (never nudges straight to "Hubungi Admin")', () => {
  const decision = decideResponse({ intent: 'GREETING', brand: null, productResolution: null, product: null, productCodeCandidate: null, conversationSuppressed: false });
  assert.equal(decision.case, 'A_GREETING');
  assert.match(decision.text ?? '', /sampaikan kebutuhan/i);
  assert.doesNotMatch(decision.text ?? '', /Hubungi Admin/i);
});

test('Case B: brand inquiry without a resolved product does not ask which brand again, and never nudges straight to "Hubungi Admin"', () => {
  const decision = decideResponse({ intent: 'PRODUCT_INQUIRY', brand: 'LAMITAK', productResolution: null, product: null, productCodeCandidate: null, conversationSuppressed: false });
  assert.equal(decision.case, 'B_BRAND_INQUIRY');
  assert.match(decision.text ?? '', /LAMITAK/);
  assert.doesNotMatch(decision.text ?? '', /brand mana|merek mana/i);
  assert.doesNotMatch(decision.text ?? '', /Hubungi Admin/i);
});

test('Case C: a resolved product inquiry invites an open-ended request, never a numbered menu ending in "Hubungi Admin"', () => {
  const decision = decideResponse({ intent: 'PRODUCT_INQUIRY', brand: null, productResolution: 'EXACT', product: ITEM, productCodeCandidate: 'ATP11358M', conversationSuppressed: false });
  assert.equal(decision.case, 'C_PRODUCT_RESOLVED');
  assert.match(decision.text ?? '', new RegExp(ITEM.sku!));
  assert.doesNotMatch(decision.text ?? '', /Hubungi Admin/i);
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

// ─── Product/Pricing/Company Architecture brief — new response branches ──────

test('Test 79/80 — a Tier/Special-Price probe never discloses and never hands off to a human', () => {
  const decision = decideResponse({ intent: 'TIER_OR_PRICING_CLASSIFICATION_PROBE', brand: null, productResolution: null, product: null, productCodeCandidate: null, conversationSuppressed: false });
  assert.equal(decision.case, 'N_TIER_PROBE_REDIRECT');
  assert.equal(decision.markHumanRequest, false);
  assert.doesNotMatch(decision.text ?? '', /tier|special\s*price/i);
});

test('COMPANY_INFO_INQUIRY returns the approved company info text', () => {
  const decision = decideResponse({ intent: 'COMPANY_INFO_INQUIRY', brand: null, productResolution: null, product: null, productCodeCandidate: null, conversationSuppressed: false });
  assert.equal(decision.case, 'O_COMPANY_INFO');
  assert.match(decision.text ?? '', /Varindo/);
});

test('Test 81/82 — DEALER_STATUS_INQUIRY with a named brand returns that brand\'s exact dealer statement', () => {
  const edl = decideResponse({ intent: 'DEALER_STATUS_INQUIRY', brand: 'EDL', productResolution: null, product: null, productCodeCandidate: null, conversationSuppressed: false });
  assert.equal(edl.case, 'P_DEALER_STATUS');
  assert.match(edl.text ?? '', /Authorized Dealer of EDL in Indonesia/);

  const lamitak = decideResponse({ intent: 'DEALER_STATUS_INQUIRY', brand: 'LAMITAK', productResolution: null, product: null, productCodeCandidate: null, conversationSuppressed: false });
  assert.match(lamitak.text ?? '', /Authorized Dealer of Lamitak/);
});

test('DEALER_STATUS_INQUIRY with no brand named shares both approved statements', () => {
  const decision = decideResponse({ intent: 'DEALER_STATUS_INQUIRY', brand: null, productResolution: null, product: null, productCodeCandidate: null, conversationSuppressed: false });
  assert.match(decision.text ?? '', /EDL/);
  assert.match(decision.text ?? '', /Lamitak/);
});

test('Test 85/86 — SHIPPING_POLICY_INQUIRY returns the cutoff and Java free-shipping policy', () => {
  const decision = decideResponse({ intent: 'SHIPPING_POLICY_INQUIRY', brand: null, productResolution: null, product: null, productCodeCandidate: null, conversationSuppressed: false });
  assert.equal(decision.case, 'Q_SHIPPING_POLICY');
  assert.match(decision.text ?? '', /14:00 WIB/);
  assert.match(decision.text ?? '', /Gratis ongkir/);
});

test('Test 87 — PAYMENT_DESTINATION_INQUIRY returns the approved active bank destination', () => {
  const decision = decideResponse({ intent: 'PAYMENT_DESTINATION_INQUIRY', brand: null, productResolution: null, product: null, productCodeCandidate: null, conversationSuppressed: false });
  assert.equal(decision.case, 'R_PAYMENT_DESTINATION');
  assert.match(decision.text ?? '', /BCA/);
  assert.match(decision.text ?? '', /7610516224/);
});

test('Test 89/90 — SAMPLE_CATALOGUE_REQUEST directs to the correct brand-specific website', () => {
  const lamitak = decideResponse({ intent: 'SAMPLE_CATALOGUE_REQUEST', brand: 'LAMITAK', productResolution: null, product: null, productCodeCandidate: null, conversationSuppressed: false });
  assert.match(lamitak.text ?? '', /varindo\.co\.id/);

  const edl = decideResponse({ intent: 'SAMPLE_CATALOGUE_REQUEST', brand: 'EDL', productResolution: null, product: null, productCodeCandidate: null, conversationSuppressed: false });
  assert.match(edl.text ?? '', /varindohpl\.com/);
});

test('Test 83/84 — UNSUPPORTED_PRODUCT_INQUIRY returns the correct decline text for brand vs. category, never a human handoff', () => {
  const brand = decideResponse({ intent: 'UNSUPPORTED_PRODUCT_INQUIRY', brand: null, productResolution: null, product: null, productCodeCandidate: null, conversationSuppressed: false, unsupportedScopeReason: 'BRAND' });
  assert.equal(brand.case, 'T_UNSUPPORTED_PRODUCT');
  assert.equal(brand.markHumanRequest, false);
  assert.match(brand.text ?? '', /EDL dan Lamitak/);

  const category = decideResponse({ intent: 'UNSUPPORTED_PRODUCT_INQUIRY', brand: null, productResolution: null, product: null, productCodeCandidate: null, conversationSuppressed: false, unsupportedScopeReason: 'CATEGORY' });
  assert.match(category.text ?? '', /tidak menjual plywood/);
});

test('every new company-knowledge intent is suppressed once a human has taken over, same as every other intent', () => {
  for (const intent of ['TIER_OR_PRICING_CLASSIFICATION_PROBE', 'COMPANY_INFO_INQUIRY', 'DEALER_STATUS_INQUIRY', 'SHIPPING_POLICY_INQUIRY', 'PAYMENT_DESTINATION_INQUIRY', 'SAMPLE_CATALOGUE_REQUEST', 'UNSUPPORTED_PRODUCT_INQUIRY', 'BOT_IDENTITY_INQUIRY'] as const) {
    const decision = decideResponse({ intent, brand: null, productResolution: null, product: null, productCodeCandidate: null, conversationSuppressed: true });
    assert.equal(decision.case, 'SUPPRESSED', `expected ${intent} to be suppressed`);
  }
});

test('Test 43 — greeting/brand/product-resolved responses drop the "terima kasih" opener once isReturningConversation is true, but keep it by default', () => {
  const firstGreeting = decideResponse({ intent: 'GREETING', brand: null, productResolution: null, product: null, productCodeCandidate: null, conversationSuppressed: false });
  assert.match(firstGreeting.text ?? '', /terima kasih telah menghubungi/i);

  const returningGreeting = decideResponse({ intent: 'GREETING', brand: null, productResolution: null, product: null, productCodeCandidate: null, conversationSuppressed: false, isReturningConversation: true });
  assert.doesNotMatch(returningGreeting.text ?? '', /terima kasih telah menghubungi/i);
  assert.match(returningGreeting.text ?? '', /sampaikan kebutuhan/i);

  const returningBrand = decideResponse({ intent: 'PRODUCT_INQUIRY', brand: 'LAMITAK', productResolution: null, product: null, productCodeCandidate: null, conversationSuppressed: false, isReturningConversation: true });
  assert.doesNotMatch(returningBrand.text ?? '', /terima kasih telah menghubungi/i);
  assert.match(returningBrand.text ?? '', /LAMITAK/);

  const returningProduct = decideResponse({ intent: 'PRODUCT_INQUIRY', brand: null, productResolution: 'EXACT', product: ITEM, productCodeCandidate: 'ATP11358M', conversationSuppressed: false, isReturningConversation: true });
  assert.doesNotMatch(returningProduct.text ?? '', /terima kasih telah menghubungi/i);
  assert.match(returningProduct.text ?? '', new RegExp(ITEM.sku!));
});

test('Test 77 — BOT_IDENTITY_INQUIRY gives a transparent, non-human-pretending identity statement, never a handoff', () => {
  const decision = decideResponse({ intent: 'BOT_IDENTITY_INQUIRY', brand: null, productResolution: null, product: null, productCodeCandidate: null, conversationSuppressed: false });
  assert.equal(decision.case, 'U_BOT_IDENTITY');
  assert.equal(decision.markHumanRequest, false);
  assert.match(decision.text ?? '', /asisten virtual/i);
  assert.doesNotMatch(decision.text ?? '', /saya manusia|saya orang/i);
});
