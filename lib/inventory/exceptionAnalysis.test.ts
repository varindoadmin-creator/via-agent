import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeInventoryItem } from './exceptionAnalysis.ts';

const base = { item_id: '1', name: 'Panel', sku: 'PNL-1', unit: 'pcs', stock_on_hand: 100, available_stock: 100, committed_stock: 0, reorder_level: 0, sold_90_days: 0, sold_365_days: 100 };

test('detects negative stock', () => {
  assert.ok(analyzeInventoryItem({ ...base, stock_on_hand: -2, available_stock: -2 }).some((a) => a.type === 'negative_stock'));
});

test('estimates stockout within 30 days', () => {
  const alert = analyzeInventoryItem({ ...base, stock_on_hand: 20, available_stock: 20, sold_90_days: 90 }).find((a) => a.type === 'stockout_risk');
  assert.equal(alert?.days_of_stock, 20);
  assert.equal(alert?.recommendation.includes('10 pcs'), true);
});

test('detects stock with no sales for 365 days', () => {
  assert.ok(analyzeInventoryItem({ ...base, sold_365_days: 0 }).some((a) => a.type === 'aging_stock'));
});

test('recommends a transfer only from real available stock', () => {
  const alert = analyzeInventoryItem({
    ...base,
    locations: [
      { location_name: 'HUB-BDG', stock_on_hand: 2, committed_stock: 7, available_stock: -5 },
      { location_name: 'HEAD OFFICE', stock_on_hand: 20, committed_stock: 0, available_stock: 12 },
    ],
  }).find((a) => a.type === 'location_mismatch');
  assert.deepEqual(alert?.transfer, { from: 'HEAD OFFICE', to: 'HUB-BDG', quantity: 5 });
});
