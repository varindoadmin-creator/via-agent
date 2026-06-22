import { NextRequest, NextResponse } from 'next/server';
import { getZohoAccessToken, getZohoApiBaseUrl, getZohoOrgId } from '@/lib/zoho/auth';

function getLocationMap(): Record<string, string> {
  return {
    [process.env.ZOHO_LOCATION_HO  || '8607767000000093103']: 'HEAD OFFICE',
    [process.env.ZOHO_LOCATION_BDG || '8607767000000093565']: 'HUB-BDG',
    [process.env.ZOHO_LOCATION_MDN || '8607767000000221577']: 'HUB-MDN',
  };
}

async function zohoGet(path: string) {
  const token = await getZohoAccessToken();
  const base = getZohoApiBaseUrl();
  const orgId = getZohoOrgId();
  const sep = path.includes('?') ? '&' : '?';
  const url = `${base}${path}${sep}organization_id=${orgId}`;
  const res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` } });
  const body = await res.json();
  if (!res.ok) throw new Error(`Zoho ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

export interface InventoryItem {
  item_id: string;
  item_name: string;
  item_code: string;
  brand: string;
  sku: string;
  unit: string;
  location_name: string;
  stock_on_hand: number;
  committed_stock: number;
  available_for_sale: number;
}

function detectBrand(name: string, sku: string): string {
  const n = name.toUpperCase();
  const s = sku.toUpperCase();
  if (n.includes('LAMITAK') || s.startsWith('LAM-')) return 'LAMITAK';
  if (n.includes('GREENLAM') || s.startsWith('GREEN-')) return 'GREENLAM';
  if (n.includes(' EDL ') || s.startsWith('EDL-')) return 'EDL';
  if (n.includes('AICA') || s.startsWith('AICA-')) return 'AICA';
  if (n.includes('TACO') || s.startsWith('TACO-')) return 'TACO';
  if (n.includes('CARTA') || s.startsWith('CARTA-')) return 'CARTA';
  if (n.includes('AIDI') || s.startsWith('AIDI-')) return 'AIDI';
  if (n.includes('ECO') || s.startsWith('ECO-')) return 'ECO';
  return 'OTHER';
}

function extractItemCode(name: string): string {
  const dash = name.indexOf(' - ');
  if (dash > 0) return name.substring(0, dash).trim();
  return name.split(' ').slice(0, 3).join(' ');
}

// Search Zoho items by keyword — returns stock_on_hand correctly
async function searchItemsByKeyword(keyword: string): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let page = 1;
  let hasMore = true;
  while (hasMore) {
    const res = await zohoGet(
      `/items?search_text=${encodeURIComponent(keyword)}&per_page=200&page=${page}`
    );
    const batch = res.items || [];
    items.push(...batch);
    hasMore = res.page_context?.has_more_page === true;
    page++;
    if (page > 10) break;
  }
  return items;
}

// Fetch item detail for location breakdown — only for items with stock
async function fetchDetailBatch(ids: string[]): Promise<Record<string, unknown>[]> {
  const BATCH = 15;
  const results: Record<string, unknown>[] = [];
  for (let i = 0; i < ids.length; i += BATCH) {
    const slice = ids.slice(i, i + BATCH);
    const details = await Promise.all(
      slice.map(async id => {
        try {
          const r = await zohoGet(`/items/${id}`);
          return r.item || null;
        } catch { return null; }
      })
    );
    results.push(...details.filter(Boolean) as Record<string, unknown>[]);
  }
  return results;
}

// Brand → search keywords mapping
// Using brand name as search term finds all items with that brand in name
const BRAND_KEYWORDS: Record<string, string[]> = {
  'LAMITAK':   ['LAMITAK'],
  'GREENLAM':  ['GREENLAM'],
  'EDL':       ['EDL'],
  'AICA':      ['AICA'],
  'TACO':      ['TACO'],
  'CARTA':     ['CARTA'],
  'AIDI':      ['AIDI'],
  'ECO':       ['ECO'],
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const brand = searchParams.get('brand') || 'all';
  const search = searchParams.get('search') || '';

  try {
    const locationMap = getLocationMap();
    let candidateItems: Record<string, unknown>[] = [];

    if (search.trim()) {
      // Search by user query — direct search_text call
      candidateItems = await searchItemsByKeyword(search.trim());
      console.log(`[Inventory] Search "${search}" → ${candidateItems.length} items`);
    } else if (brand !== 'all' && BRAND_KEYWORDS[brand.toUpperCase()]) {
      // Search by brand keyword
      const keywords = BRAND_KEYWORDS[brand.toUpperCase()];
      for (const kw of keywords) {
        const items = await searchItemsByKeyword(kw);
        candidateItems.push(...items);
      }
      // Deduplicate by item_id
      const seen = new Set<string>();
      candidateItems = candidateItems.filter(i => {
        const id = String(i.item_id);
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });
      console.log(`[Inventory] Brand "${brand}" → ${candidateItems.length} items`);
    } else {
      // All brands — search each brand keyword and merge
      const seen = new Set<string>();
      for (const keywords of Object.values(BRAND_KEYWORDS)) {
        for (const kw of keywords) {
          const items = await searchItemsByKeyword(kw);
          for (const item of items) {
            const id = String(item.item_id);
            if (!seen.has(id)) {
              seen.add(id);
              candidateItems.push(item);
            }
          }
        }
      }
      console.log(`[Inventory] All brands → ${candidateItems.length} items`);
    }

    // Filter to items with stock_on_hand > 0 (search_text returns real stock values)
    const withStock = candidateItems.filter(i => Number(i.stock_on_hand) > 0);
    console.log(`[Inventory] ${withStock.length} items with stock > 0`);

    if (withStock.length === 0) {
      return NextResponse.json({
        success: true,
        total_items: 0,
        by_location: { 'HEAD OFFICE': [], 'HUB-BDG': [], 'HUB-MDN': [] },
      });
    }

    // Fetch detail only for items with stock → get location breakdown
    const ids = withStock.map(i => String(i.item_id));
    console.log(`[Inventory] Fetching detail for ${ids.length} items with stock...`);
    const details = await fetchDetailBatch(ids);

    // Build inventory rows
    const allInventory: InventoryItem[] = [];

    for (const item of details) {
      if (!item?.locations?.length) continue;

      const itemBrand = detectBrand(String(item.name || ''), String(item.sku || ''));
      const itemCode = extractItemCode(String(item.name || ''));

      for (const loc of item.locations as Record<string, unknown>[]) {
        const locName = locationMap[String(loc.location_id)];
        if (!locName) continue;

        const stockOnHand = Number(loc.location_stock_on_hand) || 0;
        const committedStock = Number(loc.location_committed_stock) || 0;
        const availableForSale =
          Number(loc.location_available_for_sale_stock) ||
          Math.max(0, stockOnHand - committedStock);

        if (stockOnHand <= 0) continue;

        allInventory.push({
          item_id: String(item.item_id),
          item_name: String(item.name || ''),
          item_code: itemCode,
          brand: itemBrand,
          sku: String(item.sku || ''),
          unit: String(item.unit || 'sht'),
          location_name: locName,
          stock_on_hand: stockOnHand,
          committed_stock: committedStock,
          available_for_sale: availableForSale,
        });
      }
    }

    console.log(`[Inventory] ${allInventory.length} location rows with stock`);

    // Group and sort
    const byLocation: Record<string, InventoryItem[]> = {
      'HEAD OFFICE': [],
      'HUB-BDG': [],
      'HUB-MDN': [],
    };

    for (const item of allInventory) {
      if (byLocation[item.location_name]) {
        byLocation[item.location_name].push(item);
      }
    }

    for (const loc of Object.keys(byLocation)) {
      byLocation[loc].sort((a, b) => {
        const bc = a.brand.localeCompare(b.brand);
        return bc !== 0 ? bc : a.item_code.localeCompare(b.item_code);
      });
    }

    return NextResponse.json({
      success: true,
      total_items: allInventory.length,
      by_location: byLocation,
    });

  } catch (err) {
    console.error('[Inventory] Error:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
