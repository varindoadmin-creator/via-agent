import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filterItemsByActiveIds,
  getPricebookIdByTier,
  PRICE_LIST_TIERS,
} from './pricebookConfig.ts';

test('includes the live Bronze Plus tier and pricebook ID', () => {
  assert.deepEqual(PRICE_LIST_TIERS, ['Bronze', 'Bronze Plus', 'Silver', 'Gold', 'Platinum']);
  assert.equal(getPricebookIdByTier('Bronze Plus'), '8607767000004477463');
});

test('filters pricebook rows to active Zoho item IDs', () => {
  const items = [
    { item_id: 'active-1', name: 'Active item', pricebook_rate: 100 },
    { item_id: 'inactive-1', name: 'Inactive item', pricebook_rate: 90 },
  ];
  assert.deepEqual(
    filterItemsByActiveIds(items, new Set(['active-1'])).map(item => item.item_id),
    ['active-1'],
  );
});
