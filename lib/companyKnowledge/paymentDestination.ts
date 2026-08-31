// ─── Payment destination — approved bank account ──────────────────────────────
// VIA Product/Pricing/Company Architecture brief, sections 39-40: the one
// ACTIVE approved bank destination that may be shown to customers. Distinct
// from payment STATUS ("sudah masuk?"), which stays routed to Phase 7's live
// Zoho/payment data (lib/customerSelfService/paymentStatus.ts) — never
// confused with this static destination record.

export interface PaymentDestination {
  bank: string;
  accountName: string;
  accountNumber: string;
  branch: string;
  status: 'ACTIVE' | 'INACTIVE';
}

const PAYMENT_DESTINATIONS: readonly PaymentDestination[] = [
  { bank: 'BCA', accountName: 'CV. VARINDO FORMA HUTAMA', accountNumber: '7610516224', branch: 'KCP Supermal Karawaci, Tangerang', status: 'ACTIVE' },
];

/** Only ever returns an ACTIVE approved destination (brief section 39's explicit constraint) — never an inactive/historical one. */
export function getActivePaymentDestination(): PaymentDestination | null {
  return PAYMENT_DESTINATIONS.find(d => d.status === 'ACTIVE') ?? null;
}
