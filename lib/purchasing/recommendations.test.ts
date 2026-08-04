import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_MIRPO_CONFIG, applyManualDraftState, buildMirpoPortfolio, buildPurchaseRecommendation, roundOrderQuantity,
  type PurchaseRecommendationInput,
} from './recommendations.ts';
import { assertMirpoPolicyQuantity, canCreateMirpoDraft, validateDraftItems } from './draftValidation.ts';

const base: PurchaseRecommendationInput = {
  item_id: 'item-1', sku: 'SKU-1', name: 'Panel', unit: 'sht', category: 'LAMITAK', warehouse: 'All locations',
  vendor_id: 'vendor-1', vendor_name: 'Supplier A', purchase_rate: 100,
  stock_on_hand: 20, committed_stock: 0, available_stock: 20,
  open_sales_order_qty: 30, incoming_po_qty: 5, history_bucket_days: 30,
  sold_recent_days: 30, sold_middle_days: 30, sold_older_days: 30, returns_qty: 0, cancelled_qty: 0,
  lead_time_days: 30, reorder_level: 0, preferred_stock_level: 0, minimum_order_qty: 0, order_multiple: 0,
  sales_orders: ['SO-1'], purchase_orders: ['PO-1'], mirpo_orders: [], assumptions: [],
};

test('normal reorder uses weighted demand, safety stock, stock, and incoming PO', () => {
  const result = buildPurchaseRecommendation(base, DEFAULT_MIRPO_CONFIG, new Date('2026-08-04T00:00:00Z'));
  assert.equal(result.forecast_demand, 60);
  assert.equal(result.safety_stock_qty, 14);
  assert.equal(result.recommended_qty, 49);
  assert.equal(result.estimated_cost, 4900);
});

test('zero and negative results never recommend below zero', () => {
  const result = buildPurchaseRecommendation({ ...base, available_stock: 200, incoming_po_qty: 50 });
  assert.equal(result.recommended_qty, 0);
  assert.equal(result.urgency, 'no_action');
});

test('open PO and existing MIRPO quantities prevent a duplicate recommendation', () => {
  const result = buildPurchaseRecommendation({ ...base, incoming_po_qty: 100, mirpo_orders: ['MIRPO-12'] });
  assert.equal(result.recommended_qty, 0);
});

test('MOQ and order-multiple rounding are respected', () => {
  assert.equal(roundOrderQuantity(17, 50, 12), 60);
  assert.equal(roundOrderQuantity(0, 50, 12), 0);
});

test('missing lead time uses configured fallback and is labelled', () => {
  const result = buildPurchaseRecommendation({ ...base, lead_time_days: 0 });
  assert.equal(result.lead_time_days, 30);
  assert.ok(result.assumptions.some((value) => value.includes('Lead time fallback')));
});

test('missing vendor is insufficient data', () => {
  const result = buildPurchaseRecommendation({ ...base, vendor_id: '', vendor_name: 'Supplier not assigned' });
  assert.equal(result.urgency, 'insufficient_data');
  assert.equal(result.confidence, 'low');
});

test('no sales history with no open demand is insufficient data', () => {
  const result = buildPurchaseRecommendation({ ...base, sold_recent_days: 0, sold_middle_days: 0, sold_older_days: 0, open_sales_order_qty: 0 });
  assert.equal(result.urgency, 'insufficient_data');
  assert.equal(result.recommended_qty, 0);
});

test('returns and cancelled orders reduce demand without producing negatives', () => {
  const result = buildPurchaseRecommendation({ ...base, returns_qty: 30, cancelled_qty: 20 });
  assert.ok(result.forecast_demand < 60);
  assert.ok(result.recommended_qty >= 0);
});

test('multiple warehouses remain independent calculation rows', () => {
  const ho = buildPurchaseRecommendation({ ...base, item_id: 'ho', warehouse: 'HEAD OFFICE', available_stock: 0 });
  const bdg = buildPurchaseRecommendation({ ...base, item_id: 'bdg', warehouse: 'HUB-BDG', available_stock: 100 });
  assert.ok(ho.recommended_qty > 0);
  assert.equal(bdg.recommended_qty, 0);
});

test('data synchronization errors are clearly classified', () => {
  const result = buildPurchaseRecommendation({ ...base, data_error: 'Zoho authentication failed' });
  assert.equal(result.urgency, 'data_error');
});

test('manual adjustments and exclusions survive refresh merging', () => {
  const rows = [{ item_id: '1', recommended_qty: 10, vendor_name: 'A', recommended_order_date: '2026-08-10' }];
  const merged = applyManualDraftState(rows, { '1': { quantity: 25, vendor_name: 'B' } }, { '1': 'Seasonal item' });
  assert.equal(merged[0].recommended_qty, 25);
  assert.equal(merged[0].vendor_name, 'B');
  assert.equal(merged[0].excluded, true);
});

test('local draft validation and authorization reject unsafe input', () => {
  assert.equal(canCreateMirpoDraft('director'), true);
  assert.equal(canCreateMirpoDraft('admin'), false);
  assert.throws(() => validateDraftItems([{ item_id: '1', quantity: -1 }]));
  assert.equal(validateDraftItems([{ item_id: '1', quantity: 1 }])[0].quantity, 1);
});

test('LAMITAK MIRPO portfolio totals 600 sheets and exposes 30-day excess risk', () => {
  const fast = buildPurchaseRecommendation({ ...base, item_id: 'fast', available_stock: 0, incoming_po_qty: 0, open_sales_order_qty: 0, sold_recent_days: 600, sold_middle_days: 600, sold_older_days: 600 });
  const slow = buildPurchaseRecommendation({ ...base, item_id: 'slow', available_stock: 20, incoming_po_qty: 0, open_sales_order_qty: 0, sold_recent_days: 30, sold_middle_days: 30, sold_older_days: 30 });
  const portfolio = buildMirpoPortfolio([fast, slow], 600, 30);
  assert.equal(portfolio.recommended_qty, 600);
  assert.equal(portfolio.items.reduce((sum, item) => sum + item.recommended_qty, 0), 600);
  assert.equal(portfolio.ready_to_order, true);
  assert.equal(portfolio.excess_risk_qty, 0);
});

test('MIRPO local draft must preserve the 600-sheet brand policy', () => {
  const valid = validateDraftItems([{ item_id: '1', quantity: 600 }]);
  assert.doesNotThrow(() => assertMirpoPolicyQuantity(valid));
  assert.throws(() => assertMirpoPolicyQuantity(validateDraftItems([{ item_id: '1', quantity: 599 }])));
});
