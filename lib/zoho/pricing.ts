// ─── Authoritative pricing orchestration ────────────────────────────────────────
// Brief section 3/4: thin orchestration over the existing, already-live
// pricing chain — customerPricing.ts's getCustomerItemPrice() (tier pricebook
// with base-rate fallback, already used by the internal Jarvis tool
// get_customer_price) plus the item's own tax_percentage. No new Zoho
// integration; this does not invent a pricing engine.

import { getCustomerItemPrice } from './customerPricing.ts';
import { getItemDetail } from './items.ts';

export type PriceSource = 'customer_pricebook' | 'base_item_rate';

export interface AuthoritativePrice {
  itemId: string;
  itemCode: string | null;
  itemName: string;
  /** Excludes tax — apply lib/zoho/tax.ts's computeDisplayPrice for the customer-facing figure. */
  baseRateExclTax: number;
  taxPercentage: number;
  priceSource: PriceSource;
  customerTier: string | null;
}

/**
 * Brief section 11's flow: customerId resolved + a specific price exists for
 * them -> use it; otherwise (no customerId, or no customer-specific price) ->
 * the standard base item rate. Returns null only when the item itself can't
 * be resolved (brief section 25: PRICE_NOT_FOUND, never guessed).
 */
export async function resolveAuthoritativePrice(input: { itemId: string; customerId?: string | null }): Promise<AuthoritativePrice | null> {
  const item = await getItemDetail(input.itemId);
  if (!item || item.status !== 'active') return null;

  if (input.customerId) {
    const customerPrice = await getCustomerItemPrice(input.customerId, input.itemId);
    if (customerPrice) {
      return {
        itemId: item.item_id,
        itemCode: item.sku ?? null,
        itemName: item.name,
        baseRateExclTax: customerPrice.official_rate,
        taxPercentage: item.tax_percentage ?? 0,
        priceSource: customerPrice.price_source,
        customerTier: customerPrice.customer_tier,
      };
    }
  }

  return {
    itemId: item.item_id,
    itemCode: item.sku ?? null,
    itemName: item.name,
    baseRateExclTax: Number(item.rate) || 0,
    taxPercentage: item.tax_percentage ?? 0,
    priceSource: 'base_item_rate',
    customerTier: null,
  };
}
