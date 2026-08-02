import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPurchaseRecommendation, groupRecommendationsBySupplier } from './recommendations.ts';

const base = {
  item_id: 'item-1', sku: 'SKU-1', name: 'Panel', unit: 'sht',
  vendor_id: 'vendor-1', vendor_name: 'Supplier A', purchase_rate: 100,
  stock_on_hand: 20, open_sales_order_qty: 30, incoming_po_qty: 5,
  sold_90_days: 90, lead_time_days: 30,
  sales_orders: ['SO-1'], purchase_orders: ['PO-1'],
};

test('nets stock and incoming POs from SO, lead-time, and safety demand', () => {
  const result = buildPurchaseRecommendation(base);
  assert.equal(result.demand_during_lead_time, 30);
  assert.equal(result.safety_stock_qty, 14);
  assert.equal(result.recommended_qty, 49);
  assert.equal(result.coverage_status, 'uncovered_so');
  assert.equal(result.estimated_cost, 4900);
});

test('does not recommend a purchase when stock and incoming supply cover demand', () => {
  const result = buildPurchaseRecommendation({ ...base, stock_on_hand: 100, incoming_po_qty: 20 });
  assert.equal(result.recommended_qty, 0);
  assert.equal(result.coverage_status, 'covered');
});

test('groups approval proposals by supplier', () => {
  const a = buildPurchaseRecommendation(base);
  const b = buildPurchaseRecommendation({ ...base, item_id: 'item-2', sku: 'SKU-2', sales_orders: ['SO-2'] });
  const proposals = groupRecommendationsBySupplier([a, b]);
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0].item_count, 2);
  assert.deepEqual(proposals[0].sales_orders, ['SO-1', 'SO-2']);
});
