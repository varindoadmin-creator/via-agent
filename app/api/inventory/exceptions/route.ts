import { NextResponse } from 'next/server';
import { analyzeInventory, type InventoryExceptionInput, type InventoryLocationSnapshot } from '@/lib/inventory/exceptionAnalysis';
import { getItemWithStock } from '@/lib/zoho/items';
import { zohoRequest } from '@/lib/zoho/client';

export const dynamic = 'force-dynamic';

type Row = Record<string, unknown>;
type CachedResult = { expires: number; payload: Record<string, unknown> };
let cache: CachedResult | null = null;

function dateDaysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function normalized(value: unknown): string {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, ' ');
}

async function fetchActiveItems(): Promise<Row[]> {
  const items: Row[] = [];
  for (let page = 1; page <= 50; page++) {
    const data = await zohoRequest<{ items?: Row[]; page_context?: { has_more_page?: boolean } }>('/items', {
      queryParams: { filter_by: 'Status.Active', per_page: 200, page },
    });
    items.push(...(data.items || []));
    if (!data.page_context?.has_more_page) break;
  }
  return items;
}

async function fetchSales(days: number): Promise<Map<string, number>> {
  const data = await zohoRequest<{ sales?: Row[] }>('/reports/salesbyitem', {
    queryParams: { from_date: dateDaysAgo(days), to_date: new Date().toISOString().slice(0, 10) },
  });
  const quantities = new Map<string, number>();
  for (const row of data.sales || []) {
    const quantity = Number(row.quantity_sold) || 0;
    const keys = [row.item_id, row.sku, row.item_name].map(normalized).filter(Boolean);
    for (const key of keys) quantities.set(key, quantity);
  }
  return quantities;
}

function salesFor(item: Row, sales: Map<string, number>): number {
  for (const key of [item.item_id, item.sku, item.name].map(normalized)) {
    if (key && sales.has(key)) return sales.get(key) || 0;
  }
  return 0;
}

async function withConcurrency<T, R>(values: T[], limit: number, work: (value: T) => Promise<R>): Promise<R[]> {
  const output: R[] = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor++;
      output[index] = await work(values[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return output;
}

export async function GET() {
  if (cache && cache.expires > Date.now()) return NextResponse.json({ ...cache.payload, cached: true });

  try {
    const [items, sales90, sales365] = await Promise.all([fetchActiveItems(), fetchSales(90), fetchSales(365)]);
    const inputs: InventoryExceptionInput[] = items.map((item) => ({
      item_id: String(item.item_id || ''),
      name: String(item.name || ''),
      sku: String(item.sku || ''),
      unit: String(item.unit || ''),
      stock_on_hand: Number(item.stock_on_hand) || 0,
      available_stock: Number(item.available_stock) || 0,
      committed_stock: Number(item.committed_stock) || 0,
      reorder_level: Number(item.reorder_level) || 0,
      sold_90_days: salesFor(item, sales90),
      sold_365_days: salesFor(item, sales365),
    }));

    // Location detail is the expensive Zoho call, so only inspect items already
    // identified as exceptions by the summary scan, capped to protect the API.
    const initialAlerts = analyzeInventory(inputs);
    const candidateIds = [...new Set(initialAlerts.map((alert) => alert.item_id))].slice(0, 150);
    const details = await withConcurrency(candidateIds, 8, getItemWithStock);
    const locationsByItem = new Map<string, InventoryLocationSnapshot[]>();
    for (const detail of details) {
      if (detail) locationsByItem.set(detail.item_id, detail.by_location);
    }

    const enriched = inputs.map((item) => ({ ...item, locations: locationsByItem.get(item.item_id) }));
    const allAlerts = analyzeInventory(enriched);
    const alerts = allAlerts.slice(0, 500);
    const counts = allAlerts.reduce<Record<string, number>>((result, alert) => {
      result[alert.type] = (result[alert.type] || 0) + 1;
      return result;
    }, {});
    const payload = {
      success: true,
      generated_at: new Date().toISOString(),
      scanned_items: items.length,
      detailed_items: details.filter(Boolean).length,
      total_alerts: allAlerts.length,
      truncated: allAlerts.length > alerts.length,
      counts,
      alerts,
      methodology: 'Stockout estimates use the last 90 days of company-wide item sales. Aging and slow-moving checks use 365 days. Transfer suggestions use current per-location stock and committed quantities. Recommendations require human approval.',
    };
    cache = { expires: Date.now() + 15 * 60_000, payload };
    return NextResponse.json(payload);
  } catch (error) {
    console.error('[inventory-exceptions]', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unable to scan inventory exceptions' }, { status: 500 });
  }
}
