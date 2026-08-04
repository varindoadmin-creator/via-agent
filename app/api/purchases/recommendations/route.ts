import { NextRequest, NextResponse } from 'next/server';
import { zohoRequest } from '@/lib/zoho/client';
import {
  DEFAULT_MIRPO_CONFIG,
  buildMirpoPortfolio,
  buildPurchaseRecommendation,
  groupRecommendationsBySupplier,
  type MirpoRecommendationConfig,
  type PurchaseRecommendationInput,
  type RecommendationConfidence,
} from '@/lib/purchasing/recommendations';
import { BRAND_VENDORS } from '@/lib/zoho/createPO';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type Row = Record<string, unknown>;
type CachedResult = { expires: number; payload: Record<string, unknown> };
const cache = new Map<string, CachedResult>();
let lastValidPayload: Record<string, unknown> | null = null;

const s = (value: unknown) => String(value || '').trim();
const n = (value: unknown) => Number(value) || 0;
const norm = (value: unknown) => s(value).toUpperCase().replace(/[^A-Z0-9]/g, '');

function dateBefore(days: number): string {
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

function clampInt(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : fallback;
}

function configFromRequest(request: NextRequest): MirpoRecommendationConfig {
  const q = request.nextUrl.searchParams;
  const confidence = q.get('minimum_confidence');
  return {
    ...DEFAULT_MIRPO_CONFIG,
    default_lead_time_days: clampInt(q.get('lead_time_days'), DEFAULT_MIRPO_CONFIG.default_lead_time_days, 1, 365),
    safety_stock_days: clampInt(q.get('safety_days'), DEFAULT_MIRPO_CONFIG.safety_stock_days, 0, 180),
    sales_history_days: clampInt(q.get('history_days'), DEFAULT_MIRPO_CONFIG.sales_history_days, 30, 365),
    minimum_confidence: (['low', 'medium', 'high'].includes(confidence || '') ? confidence : 'low') as RecommendationConfidence,
    include_open_sales_orders: q.get('include_open_so') !== 'false',
    ignore_abnormal_periods: q.get('ignore_abnormal') !== 'false',
    warehouse_scope: s(q.get('warehouse')) || 'all',
    currency: s(q.get('currency')) || 'IDR',
    include_tax: q.get('include_tax') === 'true',
    tax_rate_percent: Math.min(100, Math.max(0, Number(q.get('tax_rate_percent')) || 0)),
  };
}

async function fetchAll(path: string, key: string, queryParams: Record<string, string | number> = {}): Promise<Row[]> {
  const rows: Row[] = [];
  for (let page = 1; page <= 50; page++) {
    const data = await zohoRequest<Record<string, unknown>>(path, { queryParams: { ...queryParams, per_page: 200, page } });
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
  async function run() { while (cursor < items.length) { const index = cursor++; results[index] = await worker(items[index]); } }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

async function fetchDetails(rows: Row[], resource: 'salesorders' | 'purchaseorders', idField: string): Promise<Row[]> {
  return mapConcurrent(rows, 8, async (row) => {
    try {
      const response = await zohoRequest<Record<string, unknown>>(`/${resource}/${s(row[idField])}`);
      return (response[resource === 'salesorders' ? 'salesorder' : 'purchaseorder'] || row) as Row;
    } catch { return row; }
  });
}

function itemKey(row: Row): string { return s(row.item_id) || norm(row.sku) || norm(row.name || row.item_name); }

function customNumber(item: Row, labels: string[]): number {
  const wanted = labels.map(norm);
  const direct = labels.map((label) => item[label]).find((value) => value != null && value !== '');
  if (direct != null) return n(direct);
  for (const field of (item.custom_fields || []) as Row[]) {
    const key = norm(field.api_name || field.label || field.placeholder);
    if (wanted.some((label) => key.includes(label))) return n(field.value);
  }
  return 0;
}

function isLamitakHplSheet(item: Row): boolean {
  const brand = s(item.brand || item.cf_brand).toUpperCase();
  const haystack = [item.brand, item.cf_brand, item.category_name, item.category, item.name, item.sku].map(s).join(' ').toUpperCase();
  const unit = s(item.unit).toUpperCase();
  const excluded = /NEWEDGE|EDGE\s*BAND|EDGING|WOODEN\s*CRATE|CRATE|PACKING|PALLET/.test(haystack) || /METRE|METER|ROLL/.test(unit);
  return !excluded && (brand === 'LAMITAK' || /\bLAMITAK\b/.test(haystack)) && (/HPL|LAMITAK/.test(haystack) || /SHEET|SHT|PCS/.test(unit));
}

async function fetchSalesBucket(fromDays: number, toDays: number): Promise<Map<string, { sold: number; returns: number }>> {
  const response = await zohoRequest<{ sales?: Row[] }>('/reports/salesbyitem', {
    queryParams: { from_date: dateBefore(fromDays), to_date: dateBefore(toDays) },
  });
  const result = new Map<string, { sold: number; returns: number }>();
  for (const row of response.sales || []) {
    const raw = n(row.quantity_sold);
    const value = { sold: Math.max(0, raw), returns: Math.max(0, -raw) };
    for (const key of [row.item_id, row.sku, row.item_name].map(norm).filter(Boolean)) result.set(key, value);
  }
  return result;
}

function salesFor(item: Row, bucket: Map<string, { sold: number; returns: number }>) {
  for (const key of [item.item_id, item.sku, item.name].map(norm)) if (bucket.has(key)) return bucket.get(key)!;
  return { sold: 0, returns: 0 };
}

export async function GET(request: NextRequest) {
  const config = configFromRequest(request);
  const cacheKey = JSON.stringify(config);
  const refresh = request.nextUrl.searchParams.get('refresh') === 'true';
  const cached = cache.get(cacheKey);
  if (!refresh && cached && cached.expires > Date.now()) return NextResponse.json({ ...cached.payload, cached: true });

  try {
    const bucketDays = Math.max(10, Math.round(config.sales_history_days / 3));
    const [items, recent, middle, older, confirmedSOList, allPOList] = await Promise.all([
      fetchAll('/items', 'items', { filter_by: 'Status.Active' }),
      fetchSalesBucket(bucketDays, 0), fetchSalesBucket(bucketDays * 2, bucketDays), fetchSalesBucket(bucketDays * 3, bucketDays * 2),
      fetchAll('/salesorders', 'salesorders', { status: 'confirmed', sort_column: 'date', sort_order: 'D' }),
      fetchAll('/purchaseorders', 'purchaseorders', { sort_column: 'date', sort_order: 'D' }),
    ]);
    const inFlightStatuses = new Set(['draft', 'submitted', 'pending_approval', 'approved', 'open', 'partially_received']);
    const inFlightPOList = allPOList.filter((po) => inFlightStatuses.has(s(po.status).toLowerCase()));
    const [salesOrders, purchaseOrders] = await Promise.all([
      fetchDetails(confirmedSOList, 'salesorders', 'salesorder_id'),
      fetchDetails(inFlightPOList, 'purchaseorders', 'purchaseorder_id'),
    ]);

    const soDemand = new Map<string, { qty: number; cancelled: number; numbers: Set<string> }>();
    for (const so of salesOrders) {
      for (const line of (so.line_items || []) as Row[]) {
        const key = itemKey(line); if (!key) continue;
        const cancelled = n(line.quantity_cancelled);
        const remaining = Math.max(0, n(line.quantity) - n(line.quantity_shipped) - cancelled);
        const entry = soDemand.get(key) || { qty: 0, cancelled: 0, numbers: new Set<string>() };
        entry.qty += remaining; entry.cancelled += cancelled;
        if (remaining > 0 && so.salesorder_number) entry.numbers.add(s(so.salesorder_number));
        soDemand.set(key, entry);
      }
    }

    const incoming = new Map<string, { qty: number; numbers: Set<string>; mirpos: Set<string> }>();
    const vendorLeadTimes = new Map<string, number[]>();
    for (const po of purchaseOrders) {
      const poNumber = s(po.purchaseorder_number);
      const vendorKey = s(po.vendor_id) || norm(po.vendor_name);
      const lead = dateDiffDays(po.date, po.expected_delivery_date || po.delivery_date);
      if (vendorKey && lead) vendorLeadTimes.set(vendorKey, [...(vendorLeadTimes.get(vendorKey) || []), lead]);
      const isMirpo = [po.purchaseorder_number, po.reference_number, po.notes].map(s).join(' ').toUpperCase().includes('MIRPO');
      for (const line of (po.line_items || []) as Row[]) {
        const key = itemKey(line); if (!key) continue;
        const remaining = Math.max(0, n(line.quantity) - n(line.quantity_received) - n(line.quantity_cancelled));
        if (!remaining) continue;
        const entry = incoming.get(key) || { qty: 0, numbers: new Set<string>(), mirpos: new Set<string>() };
        entry.qty += remaining; if (poNumber) entry.numbers.add(poNumber); if (isMirpo && poNumber) entry.mirpos.add(poNumber);
        incoming.set(key, entry);
      }
    }

    const lamitakItems = items.filter(isLamitakHplSheet);
    const baseRecommendations = lamitakItems.map((item) => {
      const key = itemKey(item);
      const demand = soDemand.get(key) || { qty: 0, cancelled: 0, numbers: new Set<string>() };
      const supply = incoming.get(key) || { qty: 0, numbers: new Set<string>(), mirpos: new Set<string>() };
      const brand = s(item.brand || item.cf_brand).toUpperCase();
      const mappedVendor = BRAND_VENDORS.find((entry) => entry.brand === brand);
      const vendorId = s(item.vendor_id);
      const vendorName = s(item.vendor_name) || mappedVendor?.vendor_name || 'Supplier not assigned';
      const leads = vendorLeadTimes.get(vendorId || norm(vendorName)) || [];
      const lead = leads.length ? Math.round(leads.reduce((sum, value) => sum + value, 0) / leads.length) : 0;
      const recentSales = salesFor(item, recent), middleSales = salesFor(item, middle), olderSales = salesFor(item, older);
      const input: PurchaseRecommendationInput = {
        item_id: s(item.item_id), sku: s(item.sku), name: s(item.name), unit: s(item.unit) || 'units',
        category: s(item.category_name || item.category || brand) || 'Uncategorized', warehouse: config.warehouse_scope === 'all' ? 'All locations' : config.warehouse_scope,
        vendor_id: vendorId, vendor_name: vendorName, purchase_rate: n(item.purchase_rate),
        stock_on_hand: n(item.stock_on_hand), committed_stock: n(item.committed_stock), available_stock: n(item.available_stock ?? item.stock_on_hand) - (item.available_stock == null ? n(item.committed_stock) : 0),
        open_sales_order_qty: demand.qty, incoming_po_qty: supply.qty, history_bucket_days: bucketDays,
        sold_recent_days: recentSales.sold, sold_middle_days: middleSales.sold, sold_older_days: olderSales.sold,
        returns_qty: recentSales.returns + middleSales.returns + olderSales.returns, cancelled_qty: demand.cancelled,
        lead_time_days: lead, reorder_level: n(item.reorder_level),
        preferred_stock_level: customNumber(item, ['preferred_stock_level', 'preferred stock', 'target stock']),
        minimum_order_qty: customNumber(item, ['minimum_order_quantity', 'minimum order', 'moq']),
        order_multiple: customNumber(item, ['order_multiple', 'order multiple', 'pack size']),
        sales_orders: Array.from(demand.numbers).sort(), purchase_orders: Array.from(supply.numbers).sort(), mirpo_orders: Array.from(supply.mirpos).sort(),
        assumptions: [config.warehouse_scope === 'all' ? 'Company-wide stock because no warehouse filter was selected' : `Warehouse scope: ${config.warehouse_scope}`],
      };
      return buildPurchaseRecommendation(input, config);
    });

    const confidenceRank = { low: 1, medium: 2, high: 3 };
    const eligible = baseRecommendations.filter((row) => confidenceRank[row.confidence] >= confidenceRank[config.minimum_confidence]);
    const portfolio = buildMirpoPortfolio(eligible, 600, 30);
    const visible = portfolio.items;
    const proposals = groupRecommendationsBySupplier(visible);
    const actionable = visible.filter((row) => row.recommended_qty > 0 && row.urgency !== 'insufficient_data');
    const payload = {
      success: true, generated_at: new Date().toISOString(), sync_status: 'current', stale: false, config,
      summary: {
        suppliers: proposals.length, items_to_purchase: actionable.length,
        recommended_now: visible.filter((row) => row.urgency === 'recommended_now').length,
        recommended_soon: visible.filter((row) => row.urgency === 'recommended_soon').length,
        no_action: visible.filter((row) => row.urgency === 'no_action').length,
        insufficient_data: visible.filter((row) => row.urgency === 'insufficient_data').length,
        sales_orders_without_coverage: new Set(visible.filter((row) => row.coverage_status === 'uncovered_so').flatMap((row) => row.sales_orders)).size,
        recommended_qty: portfolio.recommended_qty, estimated_cost: actionable.reduce((sum, row) => sum + row.estimated_cost, 0),
      },
      recommendations: visible, proposals, portfolio,
      methodology: 'LAMITAK HPL only. VIA builds one 600-sheet MIRPO portfolio for a 30-day sell-through target. It first allocates sheets only where forecast 30-day sales plus open SO demand exceed available and incoming stock. Any remaining quantity required by the 600-sheet MIRPO policy is allocated to the fastest movers but explicitly marked as review-risk. Existing draft, submitted, approved, open POs and MIRPOs are deducted. Advisory local draft only.',
    };
    cache.set(cacheKey, { expires: Date.now() + 15 * 60_000, payload }); lastValidPayload = payload;
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[recommended-next-mirpo]', message);
    if (lastValidPayload) return NextResponse.json({ ...lastValidPayload, sync_status: 'stale', stale: true, sync_error: message });
    return NextResponse.json({ success: false, sync_status: 'error', error: message }, { status: 500 });
  }
}
