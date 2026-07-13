import { NextResponse } from 'next/server';
import { getZohoAccessToken, getZohoApiBaseUrl, getZohoOrgId } from '@/lib/zoho/auth';
import { fetchWithRetry } from '@/lib/zoho/retry';
import { findItemDuplicateGroups, ItemDuplicateCandidate } from '@/lib/itemCleanup/duplicates';

function detectBrand(name: string, sku: string): string {
  const n = name.toUpperCase();
  const s = sku.toUpperCase();
  if (n.includes('LAMITAK') || s.startsWith('LAM-')) return 'LAMITAK';
  if (n.includes(' EDL ') || s.startsWith('EDL-')) return 'EDL';
  if (n.includes('AICA') || s.startsWith('AICA-')) return 'AICA';
  if (n.includes('TACO') || s.startsWith('TACO-')) return 'TACO';
  if (n.includes('CARTA') || s.startsWith('CARTA-')) return 'CARTA';
  if (n.includes('ECO') || s.startsWith('ECO-')) return 'ECO';
  return 'OTHER';
}

async function zohoGet(path: string) {
  const token = await getZohoAccessToken();
  const base = getZohoApiBaseUrl();
  const orgId = getZohoOrgId();
  const sep = path.includes('?') ? '&' : '?';
  const url = `${base}${path}${sep}organization_id=${orgId}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetchWithRetry(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` }, signal: controller.signal });
    const body = await res.json();
    if (!res.ok) throw new Error(`Zoho ${res.status}: ${JSON.stringify(body)}`);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchAllItems(): Promise<ItemDuplicateCandidate[]> {
  const items: ItemDuplicateCandidate[] = [];
  let page = 1;
  let hasMore = true;
  while (hasMore) {
    const res = await zohoGet(`/items?per_page=200&page=${page}`);
    const batch = (res.items || []) as Array<{ item_id: string; name: string; sku?: string; unit?: string; status: string }>;
    for (const it of batch) {
      items.push({
        item_id: it.item_id,
        name: it.name || '',
        sku: it.sku || '',
        brand: detectBrand(it.name || '', it.sku || ''),
        unit: it.unit || '',
        status: it.status || '',
      });
    }
    hasMore = Boolean(res.page_context?.has_more_page);
    page++;
    if (page > 50) break;
  }
  return items;
}

// ─── GET /api/items/duplicates — scan for likely duplicate items ────────────

export async function GET() {
  try {
    const items = await fetchAllItems();
    const groups = findItemDuplicateGroups(items);
    const duplicateItemCount = groups.reduce((sum, g) => sum + g.items.length, 0);

    return NextResponse.json({
      success: true,
      total_items: items.length,
      group_count: groups.length,
      duplicate_item_count: duplicateItemCount,
      groups,
    });
  } catch (err) {
    console.error('[Item Duplicates] Scan error:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
