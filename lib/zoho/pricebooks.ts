import { zohoRequest } from './client';
import {
  filterItemsByActiveIds,
  getPricebookIdByTier,
  PRICE_LIST_TIERS,
  type PriceListTier,
} from './pricebookConfig';

export { getPricebookIdByTier, PRICE_LIST_TIERS, type PriceListTier } from './pricebookConfig';

interface PricebookItem {
  item_id: string;
  name: string;
  pricebook_rate: number;
  pricebook_discount?: string; // e.g. "2.00%"
}

export interface PricebookRateEntry {
  rate: number;
  discount_percent: number;
}

interface PricebookResponse {
  pricebook: {
    pricebook_id: string;
    name: string;
    pricebook_type: string;
    pricebook_items: PricebookItem[];
  };
}

interface ZohoItemSummary {
  item_id: string;
  status?: string;
}

// Cache: pricebook_id → { raw items, fetchedAt }
const pricebookCache = new Map<string, { items: PricebookItem[]; fetchedAt: number }>();
let activeItemIdsCache: { ids: Set<string>; fetchedAt: number } | null = null;
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

async function fetchActiveItemIds(): Promise<Set<string>> {
  if (activeItemIdsCache && Date.now() - activeItemIdsCache.fetchedAt < CACHE_TTL) {
    return activeItemIdsCache.ids;
  }

  const ids = new Set<string>();
  let page = 1;
  while (true) {
    const response = await zohoRequest<{
      items?: ZohoItemSummary[];
      page_context?: { has_more_page?: boolean };
    }>('/items', { queryParams: { status: 'active', per_page: 200, page } });
    for (const item of response.items || []) {
      if (item.item_id && (!item.status || item.status === 'active')) ids.add(item.item_id);
    }
    if (!response.page_context?.has_more_page || page >= 30) break;
    page++;
  }

  activeItemIdsCache = { ids, fetchedAt: Date.now() };
  return ids;
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

/** Strict pricebook lookup used when a missing/error result must not silently become a base price. */
export async function getItemPricebookEntry(
  pricebookId: string,
  itemId: string,
): Promise<PricebookRateEntry | null> {
  if (!pricebookId || !itemId) return null;
  const items = await fetchPricebookItems(pricebookId);
  const item = items.find(row => row.item_id === itemId);
  if (!item) return null;
  return {
    rate: Number(item.pricebook_rate) || 0,
    discount_percent: parseFloat(String(item.pricebook_discount || '0').replace('%', '')) || 0,
  };
}

export interface PriceListItem {
  item_id: string;
  name: string;
  discount_percent: number;
  rate: number;
}

export function filterActivePricebookItems(
  items: PricebookItem[],
  activeItemIds: ReadonlySet<string>,
): PricebookItem[] {
  return filterItemsByActiveIds(items, activeItemIds);
}

/** Items in a tier's pricebook with a nonzero discount, sorted highest discount first. */
export async function getPriceListForTier(tier: PriceListTier): Promise<PriceListItem[]> {
  const pricebookId = getPricebookIdByTier(tier);
  if (!pricebookId) return [];

  const [items, activeItemIds] = await Promise.all([
    fetchPricebookItems(pricebookId),
    fetchActiveItemIds(),
  ]);
  return filterActivePricebookItems(items, activeItemIds)
    .map(item => ({
      item_id: item.item_id,
      name: item.name,
      discount_percent: parseFloat(String(item.pricebook_discount || '0').replace('%', '')) || 0,
      rate: item.pricebook_rate,
    }))
    .filter(item => item.discount_percent > 0)
    .sort((a, b) => b.discount_percent - a.discount_percent || a.name.localeCompare(b.name));
}
