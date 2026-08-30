// ─── Customer-safe status normalization ──────────────────────────────────────
// Brief section 9: Zoho's own statuses are too technical for customers —
// this is the one deterministic mapping table, never left to Jarvis to
// interpret. Pure functions, no I/O, so every mapping decision is directly
// testable and auditable in code review rather than buried in prompt text.

export type CustomerSafeOrderStatusValue = 'RECEIVED' | 'PROCESSING' | 'CONFIRMED' | 'PARTIALLY_FULFILLED' | 'FULFILLED' | 'CANCELLED' | 'UNKNOWN';
export type CustomerSafeInvoiceStatusValue = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'VOID' | 'UNKNOWN';
export type CustomerSafeDeliveryStatusValue = 'NOT_YET_DISPATCHED' | 'PROCESSING' | 'PARTIALLY_DISPATCHED' | 'DISPATCHED' | 'DELIVERED' | 'UNKNOWN';

/**
 * Real Zoho Sales Order status values observed in this codebase
 * (types/zoho.ts's ZohoSOStatus plus the additional values used as filters in
 * app/api/shipments/route.ts: draft, pending_approval, approved, confirmed,
 * open, invoiced, partially_invoiced, void, overdue). This mapping is a
 * judgment call on non-obvious values, documented in
 * docs/customer-operations-self-service.md, not invented Zoho behavior.
 */
export function normalizeOrderStatus(zohoStatus: string | null | undefined): CustomerSafeOrderStatusValue {
  const status = (zohoStatus || '').toLowerCase();
  switch (status) {
    case 'draft':
    case 'pending_approval':
      return 'RECEIVED';
    case 'approved':
    case 'confirmed':
    case 'open':
    case 'overdue':
      return 'CONFIRMED';
    case 'partially_invoiced':
      return 'PARTIALLY_FULFILLED';
    case 'invoiced':
      return 'FULFILLED';
    case 'void':
    case 'cancelled':
      return 'CANCELLED';
    default:
      return 'UNKNOWN';
  }
}

/** Zoho invoice status values (draft/sent/viewed/unpaid/partially_paid/paid/overdue/void) combined with the live balance — never guessed from invoice age (brief section 12). */
export function normalizeInvoiceStatus(zohoStatus: string | null | undefined, balance: number | null | undefined): CustomerSafeInvoiceStatusValue {
  const status = (zohoStatus || '').toLowerCase();
  const bal = Number(balance ?? 0);
  if (status === 'void') return 'VOID';
  if (status === 'paid') return 'PAID';
  if (status === 'overdue') return 'OVERDUE';
  if (status === 'partially_paid') return 'PARTIALLY_PAID';
  if (status === 'unpaid' || status === 'sent' || status === 'viewed' || status === 'draft') {
    return bal > 0 ? 'UNPAID' : 'PAID';
  }
  return 'UNKNOWN';
}

export interface DeliveryPackageLike { status?: string | null; shipment_id?: string | null }
export interface DeliveryShipmentLike { status?: string | null }

/**
 * Derives delivery status only from real package/shipment-order records
 * (brief sections 25-26) — never inferred from Sales Order confirmation or
 * invoice payment (section 58). No packages at all -> NOT_YET_DISPATCHED;
 * inconclusive data -> UNKNOWN, never a guessed stage.
 */
export function deriveDeliveryStatus(packages: DeliveryPackageLike[], shipmentOrders: DeliveryShipmentLike[]): CustomerSafeDeliveryStatusValue {
  if (packages.length === 0) return 'NOT_YET_DISPATCHED';

  const shipped = packages.filter(p => (p.status || '').toLowerCase() === 'shipped');
  const notShipped = packages.filter(p => (p.status || '').toLowerCase() === 'not_shipped');

  if (shipped.length === 0 && notShipped.length === packages.length) return 'PROCESSING';
  if (shipped.length > 0 && notShipped.length > 0) return 'PARTIALLY_DISPATCHED';

  if (shipped.length === packages.length) {
    if (shipmentOrders.length === 0) return 'DISPATCHED';
    const allDelivered = shipmentOrders.every(s => (s.status || '').toLowerCase() === 'delivered');
    const anyDelivered = shipmentOrders.some(s => (s.status || '').toLowerCase() === 'delivered');
    if (allDelivered) return 'DELIVERED';
    if (anyDelivered) return 'PARTIALLY_DISPATCHED';
    return 'DISPATCHED';
  }

  return 'UNKNOWN';
}
