// ─── Same-day Purchase Gap detection ────────────────────────────────────────
// A Confirmed Sales Order should have a Purchase Order placed for it the same
// day — Zoho itself tracks this: once a PO is linked to an SO's demand,
// current_sub_status flips to 'cs_awaitin' ("Ordered"). If a SO confirmed
// today still hasn't reached that sub-status, Admin most likely forgot to
// place the purchase. Server-side only.

import { zohoRequest } from '@/lib/zoho/client';
import { getItemWithStock, type ItemStockSummary } from '@/lib/zoho/items';
import { getSalesOrderStockCoverage, type SalesOrderStockCoverage } from './coverage';
export { isSalesOrderCoveredByStock } from './coverage';

// Same codes used in lib/zoho/poApprovalEngine.ts — Zoho's own confirmed-SO
// sub-statuses. 'cs_awaitin' means a PO already exists for this SO's demand;
// 'cs_readyfo' ("Stock Ready") means Admin has already confirmed inventory
// covers it, so it never needed a PO in the first place — ignore both.
const SO_SUB_STATUS_ORDERED = 'cs_awaitin';
const SO_SUB_STATUS_STOCK_READY = 'cs_readyfo';

export interface PurchaseGapSO {
  salesorder_id: string;
  salesorder_number: string;
  customer_name: string;
  total: number;
  confirmed_at: string;
  sub_status_formatted: string;
  locations: string[];
  uncovered_items: SalesOrderStockCoverage['uncovered_items'];
}

async function getStockCoverage(salesOrderId: string): Promise<SalesOrderStockCoverage> {
  const response = await zohoRequest<Record<string, unknown>>(`/salesorders/${encodeURIComponent(salesOrderId)}`);
  const detail = response.salesorder as import('./coverage').SalesOrderDetail | undefined;
  if (!detail) return { covered: false, locations: [], uncovered_items: [] };

  const itemIds = Array.from(new Set(
    (detail.line_items || []).map(line => String(line.item_id || '')).filter(Boolean),
  ));
  const stocks = await Promise.all(itemIds.map(itemId => getItemWithStock(itemId)));
  const stockByItem = new Map<string, ItemStockSummary>();
  itemIds.forEach((itemId, index) => {
    const stock = stocks[index];
    if (stock) stockByItem.set(itemId, stock);
  });
  return getSalesOrderStockCoverage(detail, stockByItem);
}

async function fetchConfirmedSOs(): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let page = 1;
  let hasMore = true;
  while (hasMore) {
    const res = await zohoRequest<Record<string, unknown>>('/salesorders', {
      queryParams: { status: 'confirmed', per_page: 200, page, sort_column: 'date', sort_order: 'D' },
    });
    const batch = (res.salesorders || []) as Record<string, unknown>[];
    items.push(...batch);
    hasMore = batch.length === 200;
    page++;
    if (page > 10) break;
  }
  return items;
}

/**
 * Confirmed Sales Orders whose remaining item demand is neither represented by
 * Zoho's Ordered/Stock Ready status nor covered by stock at the assigned HUB.
 * Confirmation date is intentionally irrelevant: weekends and purchasing lead
 * time must not create false positives.
 */
export async function findSameDayPurchaseGaps(): Promise<PurchaseGapSO[]> {
  const soList = await fetchConfirmedSOs();

  const gaps: PurchaseGapSO[] = [];
  for (const so of soList) {
    const confirmedAt = String(so.submitted_date || so.last_modified_time || so.date || '');
    if (!confirmedAt) continue;

    const subStatus = String(so.current_sub_status || '');
    if (subStatus === SO_SUB_STATUS_ORDERED || subStatus === SO_SUB_STATUS_STOCK_READY) continue;

    // A PO that has already been received and converted to a bill may no longer
    // drive Zoho's "Ordered" sub-status. Do not report a false gap when the
    // resulting stock fully covers the SO at its assigned warehouse.
    const coverage = await getStockCoverage(String(so.salesorder_id || ''));
    if (coverage.covered) continue;

    gaps.push({
      salesorder_id: String(so.salesorder_id || ''),
      salesorder_number: String(so.salesorder_number || ''),
      customer_name: String(so.customer_name || ''),
      total: Number(so.total) || 0,
      confirmed_at: confirmedAt,
      sub_status_formatted: String(so.current_sub_status_formatted || 'Not Yet Ordered'),
      locations: coverage.locations,
      uncovered_items: coverage.uncovered_items,
    });
  }
  return gaps;
}
