import assert from 'node:assert/strict';
import test from 'node:test';
import { decideResponse } from './responseDecision.ts';
import type { ZohoItem } from '../../../types/zoho.ts';

const ITEM: ZohoItem = { item_id: '1', name: 'LAMITAK HPL MARMO CLASSICO PRO', sku: 'ATP11358M', rate: 0, status: 'active' };

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
