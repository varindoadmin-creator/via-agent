import { NextRequest, NextResponse } from 'next/server';
import { getZohoAccessToken, getZohoApiBaseUrl, getZohoOrgId } from '@/lib/zoho/auth';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search') || '';

  const token = await getZohoAccessToken();
  const base = getZohoApiBaseUrl();
  const orgId = getZohoOrgId();

  // Try both with and without search_text
  const results: Record<string, unknown> = {};

  // 1. Plain fetch page 1
  const url1 = `${base}/items?per_page=5&page=1&organization_id=${orgId}`;
  const res1 = await fetch(url1, { headers: { Authorization: `Zoho-oauthtoken ${token}` } });
  const data1 = await res1.json();
  results.plain_fetch = {
    count: data1.items?.length,
    page_context: data1.page_context,
    first_item: data1.items?.[0] ? {
      name: data1.items[0].name,
      sku: data1.items[0].sku,
      stock_on_hand: data1.items[0].stock_on_hand,
      has_locations: !!data1.items[0].locations?.length,
      locations_count: data1.items[0].locations?.length ?? 0,
      first_location: data1.items[0].locations?.[0],
    } : null,
  };

  // 2. Search fetch
  if (search) {
    const url2 = `${base}/items?per_page=5&page=1&search_text=${encodeURIComponent(search)}&organization_id=${orgId}`;
    const res2 = await fetch(url2, { headers: { Authorization: `Zoho-oauthtoken ${token}` } });
    const data2 = await res2.json();
    results.search_fetch = {
      query: search,
      count: data2.items?.length,
      items: data2.items?.map((i: Record<string, unknown>) => ({
        name: i.name,
        sku: i.sku,
        stock_on_hand: i.stock_on_hand,
        has_locations: !!(i as Record<string, unknown[]>).locations?.length,
        locations_count: (i as Record<string, unknown[]>).locations?.length ?? 0,
      })),
    };
  }

  // 3. Check if locations come back in list vs detail
  const firstId = data1.items?.[0]?.item_id;
  if (firstId) {
    const url3 = `${base}/items/${firstId}?organization_id=${orgId}`;
    const res3 = await fetch(url3, { headers: { Authorization: `Zoho-oauthtoken ${token}` } });
    const data3 = await res3.json();
    results.item_detail = {
      name: data3.item?.name,
      stock_on_hand: data3.item?.stock_on_hand,
      has_locations: !!data3.item?.locations?.length,
      locations_count: data3.item?.locations?.length ?? 0,
      locations: data3.item?.locations?.map((l: Record<string, unknown>) => ({
        location_id: l.location_id,
        location_name: l.location_name,
        location_stock_on_hand: l.location_stock_on_hand,
        location_available_stock: l.location_available_stock,
        location_committed_stock: l.location_committed_stock,
      })),
    };
  }

  return NextResponse.json({ success: true, results });
}
