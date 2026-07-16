// ─── Price List auto-sync ──────────────────────────────────────────────────
// Zoho doesn't auto-add newly created items to any pricebook (price list),
// and there's no "add one item" API — updating a pricebook means resending
// its ENTIRE pricebook_items array (full replace). So this scans all active
// items, diffs each of the 4 tier pricebooks against that list, and for any
// item missing from a tier, appends it — inferring discount% from other
// items that share the same leading name-prefix (e.g. "ATP", "DXN") already
// in that tier, which is 100% internally consistent across every existing
// prefix group in production data. Never guesses: no reference prefix, or a
// prefix whose existing members disagree on discount%, means skip + log for
// manual review. Existing item entries are echoed back byte-for-byte from
// what Zoho returned — never recomputed or touched — so a sync can only add
// rows, never alter or drop one.

import { zohoRequest } from './client';

export const PRICE_LIST_TIERS = ['Bronze', 'Silver', 'Gold', 'Platinum'] as const;
export type PriceListTier = (typeof PRICE_LIST_TIERS)[number];

const TIER_PRICEBOOK_MAP: Record<PriceListTier, string> = {
  Bronze: '8607767000000225630',
  Silver: '8607767000000229114',
  Gold: '8607767000000236082',
  Platinum: '8607767000000232598',
};

interface ZohoItem {
  item_id: string;
  name: string;
  rate: number;
  can_be_sold: boolean;
}

interface RawPricebookItem {
  item_id: string;
  name: string;
  pricebook_rate: number;
  pricebook_discount?: string;
}

interface RawPricebook {
  pricebook_id: string;
  name: string;
  pricebook_type: string;
  currency_id: string;
  pricing_scheme: string;
  pricebook_items: RawPricebookItem[];
}

export interface SyncResultRow {
  item_id: string;
  item_name: string;
  prefix: string | null;
  tier: PriceListTier;
  action: 'added' | 'skipped';
  reason?: 'no_reference_prefix' | 'inconsistent_prefix_discount';
  discount_applied?: string;
  rate_applied?: number;
}

export interface SyncResult {
  scanned_items: number;
  dry_run: boolean;
  rows: SyncResultRow[];
}

function extractPrefix(name: string): string | null {
  const m = name.match(/^([A-Za-z]+)/);
  return m ? m[1] : null;
}

async function fetchAllActiveSellableItems(): Promise<ZohoItem[]> {
  const items: ZohoItem[] = [];
  let page = 1;
  while (true) {
    const res = await zohoRequest<{ items: ZohoItem[]; page_context?: { has_more_page: boolean } }>(
      '/items',
      { queryParams: { status: 'active', per_page: 200, page } }
    );
    items.push(...(res.items || []).filter(i => i.can_be_sold));
    if (!res.page_context?.has_more_page || page > 30) break;
    page++;
  }
  return items;
}

async function fetchPricebook(pricebookId: string): Promise<RawPricebook> {
  const res = await zohoRequest<{ pricebook: RawPricebook }>(`/pricebooks/${pricebookId}`);
  return res.pricebook;
}

async function putPricebookItems(pricebook: RawPricebook, items: RawPricebookItem[]): Promise<void> {
  await zohoRequest(`/pricebooks/${pricebook.pricebook_id}`, {
    method: 'PUT',
    body: {
      name: pricebook.name,
      pricebook_type: pricebook.pricebook_type,
      currency_id: pricebook.currency_id,
      pricing_scheme: pricebook.pricing_scheme,
      pricebook_items: items.map(i => ({
        item_id: i.item_id,
        pricebook_rate: i.pricebook_rate,
        pricebook_discount: i.pricebook_discount || '0%',
      })),
    },
  });
}

/** prefix -> { discount, consistent }. consistent=false means existing members disagree — never usable as a reference. */
function buildPrefixDiscountMap(items: RawPricebookItem[]): Map<string, { discount: string; consistent: boolean }> {
  const byPrefix = new Map<string, Set<string>>();
  for (const item of items) {
    const prefix = extractPrefix(item.name);
    if (!prefix) continue;
    const discount = item.pricebook_discount || '0%';
    if (!byPrefix.has(prefix)) byPrefix.set(prefix, new Set());
    byPrefix.get(prefix)!.add(discount);
  }
  const result = new Map<string, { discount: string; consistent: boolean }>();
  for (const [prefix, discounts] of byPrefix) {
    const arr = Array.from(discounts);
    result.set(prefix, { discount: arr[0], consistent: arr.length === 1 });
  }
  return result;
}

async function syncTier(tier: PriceListTier, allItems: ZohoItem[], dryRun: boolean): Promise<SyncResultRow[]> {
  const pricebookId = TIER_PRICEBOOK_MAP[tier];
  const pricebook = await fetchPricebook(pricebookId);
  const existingIds = new Set(pricebook.pricebook_items.map(i => i.item_id));
  const missing = allItems.filter(i => !existingIds.has(i.item_id));
  if (missing.length === 0) return [];

  const prefixMap = buildPrefixDiscountMap(pricebook.pricebook_items);
  const rows: SyncResultRow[] = [];
  const toAdd: RawPricebookItem[] = [];

  for (const item of missing) {
    const prefix = extractPrefix(item.name);
    const ref = prefix ? prefixMap.get(prefix) : undefined;
    if (!ref) {
      rows.push({ item_id: item.item_id, item_name: item.name, prefix, tier, action: 'skipped', reason: 'no_reference_prefix' });
      continue;
    }
    if (!ref.consistent) {
      rows.push({ item_id: item.item_id, item_name: item.name, prefix, tier, action: 'skipped', reason: 'inconsistent_prefix_discount' });
      continue;
    }
    rows.push({
      item_id: item.item_id, item_name: item.name, prefix, tier, action: 'added',
      discount_applied: ref.discount, rate_applied: item.rate,
    });
    toAdd.push({ item_id: item.item_id, name: item.name, pricebook_rate: item.rate, pricebook_discount: ref.discount });
  }

  if (!dryRun && toAdd.length > 0) {
    await putPricebookItems(pricebook, [...pricebook.pricebook_items, ...toAdd]);
  }

  return rows;
}

export async function runPriceListSync(dryRun: boolean): Promise<SyncResult> {
  const allItems = await fetchAllActiveSellableItems();
  const rows: SyncResultRow[] = [];
  for (const tier of PRICE_LIST_TIERS) {
    rows.push(...await syncTier(tier, allItems, dryRun));
  }
  return { scanned_items: allItems.length, dry_run: dryRun, rows };
}
