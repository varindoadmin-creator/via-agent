import { zohoRequest } from './client';

interface PricebookItem {
  item_id: string;
  name: string;
  pricebook_rate: number;
  pricebook_discount?: string; // e.g. "2.00%"
}

interface PricebookResponse {
  pricebook: {
    pricebook_id: string;
    name: string;
    pricebook_type: string;
    pricebook_items: PricebookItem[];
  };
}

// Cache: pricebook_id → { raw items, fetchedAt }
const pricebookCache = new Map<string, { items: PricebookItem[]; fetchedAt: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

async function fetchPricebookItems(pricebookId: string): Promise<PricebookItem[]> {
  if (!pricebookId) return [];

  const cached = pricebookCache.get(pricebookId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.items;
  }

  const response = await zohoRequest<PricebookResponse>(`/pricebooks/${pricebookId}`);
  const items = response.pricebook?.pricebook_items || [];
  pricebookCache.set(pricebookId, { items, fetchedAt: Date.now() });
  console.log(`[Pricebook] Loaded ${items.length} items for pricebook ${pricebookId}`);
  return items;
}

export async function getPricebookRateMap(pricebookId: string): Promise<Map<string, number>> {
  if (!pricebookId) return new Map();

  try {
    const items = await fetchPricebookItems(pricebookId);
    const rateMap = new Map<string, number>();
    for (const item of items) {
      if (item.item_id && item.pricebook_rate) {
        rateMap.set(item.item_id, item.pricebook_rate);
      }
    }
    return rateMap;
  } catch (err) {
    console.error('[Pricebook] Failed to load:', err);
    return new Map();
  }
}

export async function getItemPricebookRate(
  pricebookId: string,
  itemId: string,
  baseRate: number
): Promise<number> {
  if (!pricebookId || !itemId) return baseRate;
  const rateMap = await getPricebookRateMap(pricebookId);
  return rateMap.get(itemId) ?? baseRate;
}

// Map cf_tier to pricebook ID
const TIER_PRICEBOOK_MAP: Record<string, string> = {
  'Bronze':      '8607767000000225630',
  'Silver':      '8607767000000229114',
  'Gold':        '8607767000000236082',
  'Platinum':    '8607767000000232598',
  'No Discount': '',
};

export function getPricebookIdByTier(tier: string): string {
  return TIER_PRICEBOOK_MAP[tier] || '';
}

export const PRICE_LIST_TIERS = ['Bronze', 'Silver', 'Gold', 'Platinum'] as const;
export type PriceListTier = (typeof PRICE_LIST_TIERS)[number];

export interface PriceListItem {
  item_id: string;
  name: string;
  discount_percent: number;
  rate: number;
}

/** Items in a tier's pricebook with a nonzero discount, sorted highest discount first. */
export async function getPriceListForTier(tier: PriceListTier): Promise<PriceListItem[]> {
  const pricebookId = getPricebookIdByTier(tier);
  if (!pricebookId) return [];

  const items = await fetchPricebookItems(pricebookId);
  return items
    .map(item => ({
      item_id: item.item_id,
      name: item.name,
      discount_percent: parseFloat(String(item.pricebook_discount || '0').replace('%', '')) || 0,
      rate: item.pricebook_rate,
    }))
    .filter(item => item.discount_percent > 0)
    .sort((a, b) => b.discount_percent - a.discount_percent || a.name.localeCompare(b.name));
}
