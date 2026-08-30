import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCustomerSafePrice } from './customerSafePrice.ts';
import type { AuthoritativePrice } from '../../../zoho/pricing.ts';

const BASE_PRICE: AuthoritativePrice = {
  itemId: 'item-1', itemCode: 'ATP11358M', itemName: 'ATP 11358M - LAMITAK HPL', baseRateExclTax: 2_600_000, taxPercentage: 11, priceSource: 'base_item_rate', customerTier: null,
};

test('Test 49 — a verified standard price produces a tax-inclusive, correctly-sourced DTO', () => {
  const dto = buildCustomerSafePrice('item-1', BASE_PRICE);
  assert.equal(dto.sourceStatus, 'VERIFIED');
  assert.equal(dto.amount, 2_886_000);
  assert.equal(dto.priceType, 'STANDARD');
  assert.equal(dto.taxIncluded, true);
  assert.equal(dto.taxRate, 11);
});

test('a customer-specific pricebook match is labeled CUSTOMER_SPECIFIC, not STANDARD', () => {
  const dto = buildCustomerSafePrice('item-1', { ...BASE_PRICE, priceSource: 'customer_pricebook', customerTier: 'Gold' });
  assert.equal(dto.priceType, 'CUSTOMER_SPECIFIC');
});

test('Test 57 — an unresolvable item yields NOT_FOUND, never a guessed amount', () => {
  const dto = buildCustomerSafePrice('unknown-item', null);
  assert.equal(dto.sourceStatus, 'NOT_FOUND');
  assert.equal(dto.amount, 0);
});

test('the DTO never carries any cost/margin/markup/discount field — structural check', () => {
  const dto = buildCustomerSafePrice('item-1', BASE_PRICE);
  const keys = Object.keys(dto);
  for (const forbidden of ['purchaseCost', 'supplierCost', 'margin', 'markup', 'priceFloor', 'internalDiscount', 'otherCustomerPrice', 'baseRateExclTax']) {
    assert.equal(keys.includes(forbidden), false, `DTO must never expose ${forbidden}`);
  }
});
