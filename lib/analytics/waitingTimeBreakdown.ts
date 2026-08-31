// ─── Waiting-time decomposition ──────────────────────────────────────────────
// VIA Customer Operations Phase 9, brief sections 15, 97: separates a
// resolved case's open duration into vendor/internal/customer components.
// No per-transition event history exists (Phase 8 doesn't log every
// waiting-state change, only the current derived label) — this computes a
// deterministic, honestly-approximate decomposition from the real timestamps
// that DO exist (stock_inquiries' created_at/closed_at for vendor time,
// commercial_drafts' created_at/updated_at while in an internal-review
// status for internal time), with customer time as the non-negative
// remainder. Mutually exclusive by construction — vendor and internal
// windows are summed independently and never both counted against the same
// span, so there is no double-count (brief section 97).

import { supabaseSelect } from '../supabase/rest.ts';

interface StockInquiryTimingRow { created_at: string; closed_at: string | null; primary_source: string | null }
interface CommercialDraftTimingRow { created_at: string; updated_at: string; status: string }

const INTERNAL_REVIEW_STATUSES = new Set(['READY_FOR_REVIEW', 'WAITING_FOR_APPROVAL', 'APPROVED', 'EXECUTING']);

export interface WaitingTimeBreakdown {
  vendorMinutes: number;
  internalMinutes: number;
  customerMinutes: number;
  totalMinutes: number;
}

function minutesBetween(a: string, b: string): number {
  return Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 60_000);
}

/**
 * Decomposes one case's total open duration (handoffCreatedAt → resolvedAt)
 * for a given conversation. Only meaningful for a resolved case — an
 * in-progress case's customer-wait remainder isn't final yet.
 */
export async function computeCaseWaitingBreakdown(input: { conversationId: string; handoffCreatedAt: string; resolvedAt: string }): Promise<WaitingTimeBreakdown> {
  const totalMinutes = minutesBetween(input.handoffCreatedAt, input.resolvedAt);

  const [stockInquiries, commercialDrafts] = await Promise.all([
    supabaseSelect<StockInquiryTimingRow>('stock_inquiries', `conversation_id=eq.${encodeURIComponent(input.conversationId)}&select=created_at,closed_at,primary_source`).catch(() => []),
    supabaseSelect<CommercialDraftTimingRow>('commercial_drafts', `conversation_id=eq.${encodeURIComponent(input.conversationId)}&select=created_at,updated_at,status`).catch(() => []),
  ]);

  const vendorMinutes = stockInquiries
    .filter(i => i.primary_source && i.closed_at)
    .reduce((sum, i) => sum + minutesBetween(i.created_at, i.closed_at as string), 0);

  const internalMinutes = commercialDrafts
    .filter(d => INTERNAL_REVIEW_STATUSES.has(d.status))
    .reduce((sum, d) => sum + minutesBetween(d.created_at, d.updated_at), 0);

  const customerMinutes = Math.max(0, totalMinutes - vendorMinutes - internalMinutes);

  return { vendorMinutes, internalMinutes, customerMinutes, totalMinutes };
}

/** Aggregates the breakdown across many resolved cases — the dashboard-facing shape (brief sections 15, 49). */
export function aggregateWaitingBreakdowns(breakdowns: WaitingTimeBreakdown[]): WaitingTimeBreakdown {
  return breakdowns.reduce((acc, b) => ({
    vendorMinutes: acc.vendorMinutes + b.vendorMinutes,
    internalMinutes: acc.internalMinutes + b.internalMinutes,
    customerMinutes: acc.customerMinutes + b.customerMinutes,
    totalMinutes: acc.totalMinutes + b.totalMinutes,
  }), { vendorMinutes: 0, internalMinutes: 0, customerMinutes: 0, totalMinutes: 0 });
}
