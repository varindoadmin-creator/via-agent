import { NextResponse } from 'next/server';
import { zohoRequest } from '@/lib/zoho/client';
import {
  buildPurchaseRecommendation,
  groupRecommendationsBySupplier,
  type PurchaseRecommendationInput,
} from '@/lib/purchasing/recommendations';
import { BRAND_VENDORS } from '@/lib/zoho/createPO';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type Row = Record<string, unknown>;
type CachedResult = { expires: number; payload: Record<string, unknown> };
let cache: CachedResult | null = null;

const s = (value: unknown) => String(value || '').trim();
const n = (value: unknown) => Number(value) || 0;
const norm = (value: unknown) => s(value).toUpperCase().replace(/[^A-Z0-9]/g, '');

function daysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function dateDiffDays(from: unknown, to: unknown): number | null {
  const start = new Date(`${s(from)}T00:00:00`).getTime();
  const end = new Date(`${s(to)}T00:00:00`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return Math.ceil((end - start) / 86_400_000);
}

async function fetchAll(path: string, key: string, queryParams: Record<string, string | number> = {}): Promise<Row[]> {
  const rows: Row[] = [];
  for (let page = 1; page <= 50; page++) {
    const data = await zohoRequest<Record<string, unknown>>(path, {
      queryParams: { ...queryParams, per_page: 200, page },
    });
    const batch = (data[key] || []) as Row[];
    rows.push(...batch);
    const context = data.page_context as { has_more_page?: boolean } | undefined;
    if (context ? !context.has_more_page : batch.length < 200) break;
  }
  return rows;
}

async function mapConcurrent<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

async function fetchDetails(rows: Row[], resource: 'salesorders' | 'purchaseorders', idField: string): Promise<Row[]> {
  return mapConcurrent(rows, 8, async (row) => {
    try {
      const response = await zohoRequest<Record<string, unknown>>(`/${resource}/${s(row[idField])}`);
      return (response[resource === 'salesorders' ? 'salesorder' : 'purchaseorder'] || row) as Row;
    } catch {
      return row;
    }
  });
}

function itemKey(row: Row): string {
  return s(row.item_id) || norm(row.sku) || norm(row.name || row.item_name);
}

export async function GET() {
  if (cache && cache.expires > Date.now()) return NextResponse.json({ ...cache.payload, cached: true });

  try {
    const [items, sales, confirmedSOList, openPOList, approvedPOList] = await Promise.all([
      fetchAll('/items', 'items', { filter_by: 'Status.Active' }),
      zohoRequest<{ sales?: Row[] }>('/reports/salesbyitem', {
        queryParams: { from_date: daysAgo(90), to_date: new Date().toISOString().slice(0, 10) },
      }).then((response) => response.sales || []),
      fetchAll('/salesorders', 'salesorders', { status: 'confirmed', sort_column: 'date', sort_order: 'D' }),
      fetchAll('/purchaseorders', 'purchaseorders', { status: 'open', sort_column: 'date', sort_order: 'D' }),
      fetchAll('/purchaseorders', 'purchaseorders', { status: 'approved', sort_column: 'date', sort_order: 'D' }),
    ]);

    const [salesOrders, purchaseOrders] = await Promise.all([
      fetchDetails(confirmedSOList, 'salesorders', 'salesorder_id'),
      fetchDetails([...openPOList, ...approvedPOList], 'purchaseorders', 'purchaseorder_id'),
    ]);

    const sales90 = new Map<string, number>();
    for (const row of sales) {
      const qty = n(row.quantity_sold);
      for (const key of [row.item_id, row.sku, row.item_name].map(norm).filter(Boolean)) sales90.set(key, qty);
    }

    const soDemand = new Map<string, { qty: number; numbers: Set<string> }>();
    for (const so of salesOrders) {
      const soNumber = s(so.salesorder_number);
      for (const line of (so.line_items || []) as Row[]) {
        const key = itemKey(line);
        if (!key) continue;
        const remaining = Math.max(0, n(line.quantity) - n(line.quantity_shipped) - n(line.quantity_cancelled));
        if (!remaining) continue;
        const entry = soDemand.get(key) || { qty: 0, numbers: new Set<string>() };
        entry.qty += remaining;
        if (soNumber) entry.numbers.add(soNumber);
        soDemand.set(key, entry);
      }
    }

    const incoming = new Map<string, { qty: number; numbers: Set<string> }>();
    const vendorLeadTimes = new Map<string, number[]>();
    for (const po of purchaseOrders) {
      const poNumber = s(po.purchaseorder_number);
      const vendorKey = s(po.vendor_id) || norm(po.vendor_name);
      const plannedLeadTime = dateDiffDays(po.date, po.expected_delivery_date || po.delivery_date);
      if (vendorKey && plannedLeadTime) {
        const values = vendorLeadTimes.get(vendorKey) || [];
        values.push(plannedLeadTime);
        vendorLeadTimes.set(vendorKey, values);
      }
      for (const line of (po.line_items || []) as Row[]) {
        const key = itemKey(line);
        if (!key) continue;
        const remaining = Math.max(0, n(line.quantity) - n(line.quantity_received) - n(line.quantity_cancelled));
        if (!remaining) continue;
        const entry = incoming.get(key) || { qty: 0, numbers: new Set<string>() };
        entry.qty += remaining;
        if (poNumber) entry.numbers.add(poNumber);
        incoming.set(key, entry);
      }
    }

    const recommendations = items.map((item) => {
      const key = itemKey(item);
      const demand = soDemand.get(key) || { qty: 0, numbers: new Set<string>() };
      const supply = incoming.get(key) || { qty: 0, numbers: new Set<string>() };
      const vendorId = s(item.vendor_id);
      const mappedVendor = BRAND_VENDORS.find((entry) => entry.brand === s(item.brand || item.cf_brand).toUpperCase());
      const vendorName = s(item.vendor_name) || mappedVendor?.vendor_name || 'Supplier not assigned';
      const leadValues = vendorLeadTimes.get(vendorId || norm(vendorName)) || [];
      const leadTime = leadValues.length
        ? Math.round(leadValues.reduce((sum, value) => sum + value, 0) / leadValues.length)
        : 30;
      const salesQty = [item.item_id, item.sku, item.name].map(norm).map((k) => sales90.get(k)).find((v) => v != null) || 0;
      const input: PurchaseRecommendationInput = {
        item_id: s(item.item_id), sku: s(item.sku), name: s(item.name), unit: s(item.unit) || 'units',
        vendor_id: vendorId, vendor_name: vendorName,
        purchase_rate: n(item.purchase_rate), stock_on_hand: n(item.stock_on_hand),
        open_sales_order_qty: demand.qty, incoming_po_qty: supply.qty,
        sold_90_days: salesQty, lead_time_days: leadTime,
        sales_orders: Array.from(demand.numbers).sort(), purchase_orders: Array.from(supply.numbers).sort(),
      };
      return buildPurchaseRecommendation(input);
    });

    const proposals = groupRecommendationsBySupplier(recommendations);
    const uncovered = recommendations.filter((row) => row.coverage_status === 'uncovered_so');
    const payload = {
      success: true,
      generated_at: new Date().toISOString(),
      summary: {
        suppliers: proposals.length,
        items_to_purchase: recommendations.filter((row) => row.recommended_qty > 0).length,
        sales_orders_without_coverage: new Set(uncovered.flatMap((row) => row.sales_orders)).size,
        recommended_qty: proposals.reduce((sum, proposal) => sum + proposal.recommended_qty, 0),
        estimated_cost: proposals.reduce((sum, proposal) => sum + proposal.estimated_cost, 0),
      },
      proposals,
      methodology: 'Recommended quantity = unfulfilled confirmed-SO demand + 90-day sales velocity during supplier lead time + 14-day safety stock − stock on hand − all quantities still to receive on approved and open POs. Lead time uses current PO expected-delivery intervals by supplier, falling back to 30 days. Draft POs are not treated as incoming stock. Advisory only: no PO is created or changed.',
    };
    cache = { expires: Date.now() + 15 * 60_000, payload };
    return NextResponse.json(payload);
  } catch (error) {
    console.error('[purchasing-recommendations]', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
