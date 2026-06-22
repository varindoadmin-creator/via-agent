// ─── Zoho Books Items + Stock ─────────────────────────────────────────────────
// Server-side only. Never import in client components.

import { getZohoAccessToken, getZohoApiBaseUrl } from './auth';
import { ZohoItem } from '@/types/zoho';

// Read lazily at call time so env vars are always fresh
function getOrgId() { return process.env.ZOHO_ORGANIZATION_ID || ''; }

function getLocationLabels(): Record<string, string> {
  return {
    [process.env.ZOHO_LOCATION_HO  || '8607767000000093103']: 'HEAD OFFICE',
    [process.env.ZOHO_LOCATION_BDG || '8607767000000093565']: 'HUB-BDG',
    [process.env.ZOHO_LOCATION_MDN || '8607767000000221577']: 'HUB-MDN',
  };
}

export interface LocationStock {
  location_id: string;
  location_name: string;
  stock_on_hand: number;
  available_stock: number;
  committed_stock: number;
  quantity_in_transit: number;
}

export interface ItemStockSummary {
  item_id: string;
  name: string;
  sku: string;
  total_stock_on_hand: number;
  total_available_stock: number;
  total_committed_stock: number;
  by_location: LocationStock[];
}

async function zohoRequest(path: string) {
  const token = await getZohoAccessToken();
  const base = getZohoApiBaseUrl();
  const sep = path.includes('?') ? '&' : '?';
  const url = `${base}${path}${sep}organization_id=${getOrgId()}`;
  const res = await fetch(url, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Zoho ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

/**
 * Search items by name or SKU.
 */
export async function searchItems(query: string): Promise<ZohoItem[]> {
  if (!query?.trim()) return [];
  try {
    const url = `/items?search_text=${encodeURIComponent(query.trim())}&per_page=10`;
    console.log('[searchItems] URL:', url, '| OrgID:', getOrgId());
    const res = await zohoRequest(url);
    console.log('[searchItems] Returned:', res.items?.length ?? 0, 'items');
    if (res.items?.length === 0) {
      // Retry with just the prefix (e.g. "DXO" instead of "DXO 5338D")
      const prefix = query.trim().split(' ')[0];
      if (prefix !== query.trim()) {
        console.log('[searchItems] Retrying with prefix:', prefix);
        const res2 = await zohoRequest(`/items?search_text=${encodeURIComponent(prefix)}&per_page=10`);
        console.log('[searchItems] Prefix retry returned:', res2.items?.length ?? 0, 'items');
        return res2.items || [];
      }
    }
    return res.items || [];
  } catch (err) {
    console.error('[searchItems] Error:', err);
    return [];
  }
}

/**
 * Get full item detail including per-location stock breakdown.
 */
export async function getItemWithStock(itemId: string): Promise<ItemStockSummary | null> {
  try {
    const res = await zohoRequest(`/items/${itemId}`);
    const item = res.item;
    if (!item) return null;

    const locations: LocationStock[] = (item.locations || []).map(
      (loc: Record<string, unknown>) => ({
        location_id: String(loc.location_id),
        location_name: getLocationLabels()[String(loc.location_id)] || String(loc.location_name),
        stock_on_hand: Number(loc.location_stock_on_hand) || 0,
        available_stock: Number(loc.location_available_stock) || 0,
        committed_stock: Number(loc.location_committed_stock) || 0,
        quantity_in_transit: Number(loc.location_quantity_in_transit) || 0,
      })
    );

    return {
      item_id: item.item_id,
      name: item.name,
      sku: item.sku || '',
      total_stock_on_hand: Number(item.stock_on_hand) || 0,
      total_available_stock: Number(item.available_stock) || 0,
      total_committed_stock: Number(item.committed_stock) || 0,
      by_location: locations,
    };
  } catch {
    return null;
  }
}

/**
 * Search items and return stock summary for each match.
 */
export async function searchItemsWithStock(query: string): Promise<ItemStockSummary[]> {
  const items = await searchItems(query);
  if (items.length === 0) return [];

  // Get stock detail for up to 5 matches in parallel
  const results = await Promise.all(
    items.slice(0, 5).map((i) => getItemWithStock(String(i.item_id)))
  );

  return results.filter((r): r is ItemStockSummary => r !== null);
}

/**
 * Format stock summary as a markdown table for VIA chat.
 */
export function formatStockSummary(stock: ItemStockSummary): string {
  const lines: string[] = [];

  lines.push(`**${stock.name}**`);
  lines.push(`SKU: ${stock.sku}`);
  lines.push('');
  lines.push('| Location | Stock on Hand | Available | Committed |');
  lines.push('|---|---|---|---|');

  for (const loc of stock.by_location) {
    lines.push(
      `| ${loc.location_name} | ${loc.stock_on_hand} | ${loc.available_stock} | ${loc.committed_stock} |`
    );
  }

  lines.push(
    `| **TOTAL** | **${stock.total_stock_on_hand}** | **${stock.total_available_stock}** | **${stock.total_committed_stock}** |`
  );

  if (stock.total_available_stock === 0) {
    lines.push('');
    lines.push('⚠️ **No available stock.** Admin Varindo will confirm.');
  } else if (stock.total_committed_stock > 0) {
    lines.push('');
    lines.push(
      `ℹ️ ${stock.total_committed_stock} units committed to existing orders.`
    );
  }

  return lines.join('\n');
}

/**
 * Score item match quality for a given search query.
 */
export function scoreItemMatch(item: ZohoItem, query: string): number {
  const q = query.toUpperCase().replace(/\s+/g, '');
  const name = (item.name || '').toUpperCase().replace(/\s+/g, '');
  const sku = (item.sku || '').toUpperCase().replace(/\s+/g, '');
  const skuCode = sku.replace(/^[A-Z]+-/, ''); // strip prefix like LAM-

  // Exact match
  if (skuCode === q || sku === q) return 1.0;
  if (name.startsWith(q + ' ') || name.startsWith(q + '-')) return 1.0;

  // Near-exact (e.g. DXO5338 → DXO5338D)
  if (skuCode.startsWith(q) || sku.startsWith(q)) return 0.9;
  if (name.startsWith(q)) return 0.85;

  // Contains
  if (sku.includes(q) || skuCode.includes(q)) return 0.6;
  if (name.includes(q)) return 0.5;

  return 0.2;
}

// Alias for backward compatibility
export const getItemById = getItemWithStock;
