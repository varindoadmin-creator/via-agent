// ─── Customer-safe price DTO ────────────────────────────────────────────────────
// Brief section 8: structurally excludes cost/margin/markup/discount-floor —
// not just by omission but because resolveAuthoritativePrice() never even
// fetches Zoho's purchase-rate fields in the first place.

import { resolveAuthoritativePrice, type AuthoritativePrice } from '../../../zoho/pricing.ts';
import { computeDisplayPrice } from '../../../zoho/tax.ts';

export type PriceSourceStatus = 'VERIFIED' | 'NOT_FOUND' | 'NEEDS_CLARIFICATION';
export type PriceType = 'STANDARD' | 'CUSTOMER_SPECIFIC' | 'PROMOTIONAL';

export interface CustomerSafePrice {
  productId: string;
  itemCode: string | null;
  amount: number; // tax-inclusive customer display amount; 0 when sourceStatus !== 'VERIFIED'
  currency: 'IDR';
  taxIncluded: boolean;
  taxRate?: number;
  priceType: PriceType;
  validAsOf: Date;
  sourceStatus: PriceSourceStatus;
}

/** Pure — no I/O. Builds the DTO from an already-resolved authoritative price (or null = PRICE_NOT_FOUND). */
export function buildCustomerSafePrice(itemId: string, authoritative: AuthoritativePrice | null): CustomerSafePrice {
  if (!authoritative) {
    return { productId: itemId, itemCode: null, amount: 0, currency: 'IDR', taxIncluded: true, priceType: 'STANDARD', validAsOf: new Date(), sourceStatus: 'NOT_FOUND' };
  }
  const amount = computeDisplayPrice(authoritative.baseRateExclTax, authoritative.taxPercentage);
  return {
    productId: authoritative.itemId,
    itemCode: authoritative.itemCode,
    amount,
    currency: 'IDR',
    taxIncluded: true,
    taxRate: authoritative.taxPercentage,
    priceType: authoritative.priceSource === 'customer_pricebook' ? 'CUSTOMER_SPECIFIC' : 'STANDARD',
    validAsOf: new Date(),
    sourceStatus: 'VERIFIED',
  };
}

/** I/O wrapper — resolves the live authoritative price, then builds the safe DTO. */
export async function getCustomerSafePrice(itemId: string, customerId: string | null): Promise<CustomerSafePrice> {
  const authoritative = await resolveAuthoritativePrice({ itemId, customerId });
  return buildCustomerSafePrice(itemId, authoritative);
}
