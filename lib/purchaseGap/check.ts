// ─── Same-day Purchase Gap detection ────────────────────────────────────────
// A Confirmed Sales Order should have a Purchase Order placed for it the same
// day — Zoho itself tracks this: once a PO is linked to an SO's demand,
// current_sub_status flips to 'cs_awaitin' ("Ordered"). If a SO confirmed
// today still hasn't reached that sub-status, Admin most likely forgot to
// place the purchase. Server-side only.

import { zohoRequest } from '@/lib/zoho/client';

const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000; // Asia/Jakarta is a fixed UTC+7, no DST.

// Same code used in lib/zoho/poApprovalEngine.ts — Zoho's own confirmed-SO
// sub-status meaning "a PO already exists for this SO's demand".
const SO_SUB_STATUS_ORDERED = 'cs_awaitin';

export interface PurchaseGapSO {
  salesorder_id: string;
  salesorder_number: string;
  customer_name: string;
  total: number;
  confirmed_at: string;
  sub_status_formatted: string;
}

function jakartaDateStr(d: Date): string {
  return new Date(d.getTime() + JAKARTA_OFFSET_MS).toISOString().split('T')[0];
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
 * Confirmed Sales Orders that were confirmed on today's Jakarta calendar date
 * but haven't reached Zoho's "Ordered" sub-status yet — i.e. no Purchase
 * Order has been placed for them today.
 */
export async function findSameDayPurchaseGaps(): Promise<PurchaseGapSO[]> {
  const soList = await fetchConfirmedSOs();
  const today = jakartaDateStr(new Date());

  const gaps: PurchaseGapSO[] = [];
  for (const so of soList) {
    const confirmedAt = String(so.submitted_date || so.last_modified_time || so.date || '');
    if (!confirmedAt) continue;
    if (jakartaDateStr(new Date(confirmedAt)) !== today) continue;

    if (String(so.current_sub_status || '') === SO_SUB_STATUS_ORDERED) continue;

    gaps.push({
      salesorder_id: String(so.salesorder_id || ''),
      salesorder_number: String(so.salesorder_number || ''),
      customer_name: String(so.customer_name || ''),
      total: Number(so.total) || 0,
      confirmed_at: confirmedAt,
      sub_status_formatted: String(so.current_sub_status_formatted || 'Not Yet Ordered'),
    });
  }
  return gaps;
}
