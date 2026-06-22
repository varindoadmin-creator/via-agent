import { NextRequest, NextResponse } from 'next/server';
import { getZohoAccessToken, getZohoApiBaseUrl } from '@/lib/zoho/auth';

const ORG_ID = process.env.ZOHO_ORGANIZATION_ID || '';

async function zohoGet(path: string) {
  const token = await getZohoAccessToken();
  const base = getZohoApiBaseUrl();
  const sep = path.includes('?') ? '&' : '?';
  const url = `${base}${path}${sep}organization_id=${ORG_ID}`;
  const res = await fetch(url, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Zoho ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('mode') || 'locations';
  const search = searchParams.get('search') || 'WY';

  try {
    const results: Record<string, unknown> = {};

    if (mode === 'locations') {
      // Try every possible Zoho endpoint for warehouses/locations
      const endpoints = [
        '/warehouses',
        '/locations',
        '/settings/warehouses',
        '/settings/locations',
      ];

      for (const ep of endpoints) {
        try {
          const res = await zohoGet(ep);
          results[ep] = res;
        } catch (e) {
          results[ep] = `ERROR: ${String(e)}`;
        }
      }

      // Also get item detail and show full locations field
      const searchRes = await zohoGet(`/items?search_text=${encodeURIComponent(search)}&per_page=5`);
      const firstId = searchRes.items?.[0]?.item_id;
      if (firstId) {
        const detail = await zohoGet(`/items/${firstId}`);
        results.item_locations_field = {
          item_id: detail.item?.item_id,
          name: detail.item?.name,
          locations: detail.item?.locations,
          is_storage_location_enabled: detail.item?.is_storage_location_enabled,
        };
      }
    }

    if (mode === 'stock') {
      // Get item with full stock breakdown
      const searchRes = await zohoGet(`/items?search_text=${encodeURIComponent(search)}&per_page=10`);
      const withStock = searchRes.items?.filter((i: Record<string, unknown>) => Number(i.stock_on_hand) > 0);
      const targetId = withStock?.[0]?.item_id || searchRes.items?.[0]?.item_id;

      if (targetId) {
        const detail = await zohoGet(`/items/${targetId}`);
        const item = detail.item;
        results.item = {
          name: item?.name,
          stock_on_hand: item?.stock_on_hand,
          available_stock: item?.available_stock,
          committed_stock: item?.committed_stock,
          actual_available_stock: item?.actual_available_stock,
          locations: item?.locations,
          is_storage_location_enabled: item?.is_storage_location_enabled,
        };
      }

      results.all_items = searchRes.items?.map((i: Record<string, unknown>) => ({
        name: i.name,
        stock_on_hand: i.stock_on_hand,
        available_stock: i.available_stock,
        committed_stock: i.committed_stock,
      }));
    }

    return NextResponse.json({ success: true, mode, results });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
