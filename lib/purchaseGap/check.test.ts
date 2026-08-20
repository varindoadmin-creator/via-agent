import test from 'node:test';
import assert from 'node:assert/strict';
import { isSalesOrderCoveredByStock } from './coverage.ts';
import type { StockSummary } from './coverage.ts';

function stock(itemId: string, locationId: string, onHand: number): StockSummary {
  return {
    by_location: [{
      location_id: locationId,
      stock_on_hand: onHand,
    }],
  };
}

test('treats received stock at the SO warehouse as purchase coverage', () => {
  const stocks = new Map([['ats', stock('ats', 'head-office', 2)]]);
  assert.equal(isSalesOrderCoveredByStock({
    location_id: 'head-office',
    line_items: [{ item_id: 'ats', quantity: 2, quantity_invoiced: 0 }],
  }, stocks), true);
});

test('keeps the purchase gap when assigned-location stock is insufficient', () => {
  const stocks = new Map([['ats', stock('ats', 'head-office', 1)]]);
  assert.equal(isSalesOrderCoveredByStock({
    location_id: 'head-office',
    line_items: [{ item_id: 'ats', quantity: 2, quantity_invoiced: 0 }],
  }, stocks), false);
});

test('does not use stock from a different warehouse', () => {
  const stocks = new Map([['ats', stock('ats', 'hub-bdg', 2)]]);
  assert.equal(isSalesOrderCoveredByStock({
    location_id: 'head-office',
    line_items: [{ item_id: 'ats', quantity: 2, quantity_invoiced: 0 }],
  }, stocks), false);
});
