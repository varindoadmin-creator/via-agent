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

test('Price/order inquiries never quote a price or confirm an order', () => {
  const priceDecision = decideResponse({ intent: 'PRICE_INQUIRY', brand: null, productResolution: null, product: null, productCodeCandidate: null, conversationSuppressed: false });
  const orderDecision = decideResponse({ intent: 'ORDER_INQUIRY', brand: null, productResolution: null, product: null, productCodeCandidate: null, conversationSuppressed: false });
  for (const decision of [priceDecision, orderDecision]) {
    assert.equal(decision.case, 'G_ACK_ROUTE');
    assert.doesNotMatch(decision.text ?? '', /Rp\.?\s*\d|disetujui|dikonfirmasi/i);
  }
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
