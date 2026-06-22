import { zohoRequest } from './client';
import { isMockMode } from './auth';

interface PricebookItem {
  item_id: string;
  name: string;
  pricebook_rate: number;
}

interface PricebookResponse {
  pricebook: {
    pricebook_id: string;
    name: string;
    pricebook_type: string;
    pricebook_items: PricebookItem[];
  };
}

// Cache: pricebook_id → { item_id → rate }
const pricebookCache = new Map<string, { rateMap: Map<string, number>; fetchedAt: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

export async function getPricebookRateMap(pricebookId: string): Promise<Map<string, number>> {
  if (!pricebookId) return new Map();

  const cached = pricebookCache.get(pricebookId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.rateMap;
  }

  try {
    const response = await zohoRequest<PricebookResponse>(`/pricebooks/${pricebookId}`);
    const items = response.pricebook?.pricebook_items || [];
    const rateMap = new Map<string, number>();
    for (const item of items) {
      if (item.item_id && item.pricebook_rate) {
        rateMap.set(item.item_id, item.pricebook_rate);
      }
    }
    pricebookCache.set(pricebookId, { rateMap, fetchedAt: Date.now() });
    console.log(`[Pricebook] Loaded ${rateMap.size} items for pricebook ${pricebookId}`);
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
