// ─── Cash Collected ────────────────────────────────────────────────────────────
// VIA Phase 12, brief sections 4, 18: distinct from Invoiced Sales (billed) and
// Sales Order Value (committed) — this is money Zoho Books actually recorded
// as received. No existing module in this codebase reads Zoho customer
// payments (confirmed by audit); this is a small, new, bounded addition
// following the exact pagination-completeness discipline every other
// Zoho-BI read in lib/jarvis/tools/*.ts already uses (reject partial
// coverage rather than silently returning an undercount).

import { zohoRequest } from '../zoho/client.ts';

type Row = Record<string, unknown>;

function n(value: unknown): number { const num = Number(value); return Number.isFinite(num) ? num : 0; }

export interface CashCollectedResult {
  from: string;
  to: string;
  amountCollected: number;
  paymentCount: number;
  coverageComplete: boolean;
}

/** Sums Zoho `customerpayments` recorded within [from, to] (inclusive, YYYY-MM-DD). Rejects partial pagination rather than returning an undercount. */
export async function getCashCollected(from: string, to: string): Promise<CashCollectedResult> {
  const rows: Row[] = [];
  let coverageComplete = true;
  for (let page = 1; page <= 20; page++) {
    const response = await zohoRequest<Row>('/customerpayments', {
      queryParams: { date_start: from, date_end: to, per_page: 200, page },
    });
    const batch = (response.customerpayments || []) as Row[];
    rows.push(...batch);
    const hasMore = Boolean((response.page_context as Row | undefined)?.has_more_page) || batch.length === 200;
    if (!hasMore) break;
    if (page === 20) coverageComplete = false;
  }
  return {
    from, to,
    amountCollected: rows.reduce((sum, row) => sum + n(row.amount), 0),
    paymentCount: rows.length,
    coverageComplete,
  };
}
