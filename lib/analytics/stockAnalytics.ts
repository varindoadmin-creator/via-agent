// ─── Stock & vendor analytics ─────────────────────────────────────────────────
// VIA Customer Operations Phase 9, brief sections 16-17, 98: rates and
// durations only — never a raw/exact stock quantity, preserving Phase 3's
// confidentiality boundary. Requested quantity (what the customer asked for)
// is reported as distinct from actual inventory (never queried here at all).

import { supabaseSelect } from '../supabase/rest.ts';
import type { DateRange } from './periods.ts';

interface StockInquiryRow {
  id: string; created_at: string; closed_at: string | null; primary_source: string | null;
  final_availability: string | null; final_source: string | null; status: string;
  requested_quantity: number | null; human_required: boolean;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function safeRate(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

export interface StockAnalyticsResult {
  inquiryCount: number;
  medianResponseMinutes: number;
  averageResponseMinutes: number;
  oosRate: number | null;
  noResponseRate: number | null;
  varindoFallbackRate: number | null;
  humanEscalationRate: number | null;
}

export async function getStockAnalytics(range: DateRange): Promise<StockAnalyticsResult> {
  const inquiries = await supabaseSelect<StockInquiryRow>(
    'stock_inquiries',
    `created_at=gte.${range.start.toISOString()}&created_at=lt.${range.end.toISOString()}&select=id,created_at,closed_at,primary_source,final_availability,final_source,status,requested_quantity,human_required`,
  );

  const resolved = inquiries.filter(i => i.closed_at);
  const responseMinutes = resolved.map(i => (new Date(i.closed_at as string).getTime() - new Date(i.created_at).getTime()) / 60_000);

  return {
    inquiryCount: inquiries.length,
    medianResponseMinutes: median(responseMinutes),
    averageResponseMinutes: responseMinutes.length ? responseMinutes.reduce((a, b) => a + b, 0) / responseMinutes.length : 0,
    oosRate: safeRate(inquiries.filter(i => i.final_availability === 'OUT_OF_STOCK').length, inquiries.length),
    noResponseRate: safeRate(inquiries.filter(i => i.status === 'VENDOR_CLOSED').length, inquiries.length),
    varindoFallbackRate: safeRate(inquiries.filter(i => i.final_source === 'VARINDO_INTERNAL').length, inquiries.length),
    humanEscalationRate: safeRate(inquiries.filter(i => i.human_required).length, inquiries.length),
  };
}

export interface VendorPerformanceRow {
  vendor: string;
  inquiryCount: number;
  medianResponseMinutes: number;
  availableRate: number | null;
  oosRate: number | null;
}

/** Brief section 17: only vendors actually present in real stock_inquiries data — never a guessed/incomplete vendor list. */
export async function getVendorPerformance(range: DateRange): Promise<VendorPerformanceRow[]> {
  const inquiries = await supabaseSelect<StockInquiryRow>(
    'stock_inquiries',
    `created_at=gte.${range.start.toISOString()}&created_at=lt.${range.end.toISOString()}&primary_source=not.is.null&select=id,created_at,closed_at,primary_source,final_availability,final_source,status,requested_quantity,human_required`,
  );

  const byVendor = new Map<string, StockInquiryRow[]>();
  for (const inquiry of inquiries) {
    const vendor = inquiry.primary_source as string;
    if (!byVendor.has(vendor)) byVendor.set(vendor, []);
    byVendor.get(vendor)!.push(inquiry);
  }

  return Array.from(byVendor.entries()).map(([vendor, rows]) => {
    const resolved = rows.filter(r => r.closed_at);
    const responseMinutes = resolved.map(r => (new Date(r.closed_at as string).getTime() - new Date(r.created_at).getTime()) / 60_000);
    return {
      vendor,
      inquiryCount: rows.length,
      medianResponseMinutes: median(responseMinutes),
      availableRate: safeRate(rows.filter(r => r.final_availability === 'AVAILABLE' || r.final_availability === 'SUFFICIENT').length, rows.length),
      oosRate: safeRate(rows.filter(r => r.final_availability === 'OUT_OF_STOCK').length, rows.length),
    };
  });
}
