// ─── Customer-scoped payment status ──────────────────────────────────────────
// VIA Customer Operations Phase 7, brief sections 20-22: reuses the exact
// same invoice status/balance data already fetched for invoice status — no
// new Zoho surface needed, and never infers a payment from a customer's own
// claim ("Saya sudah transfer kemarin").

import { getCustomerOwnInvoice, type CustomerSafeInvoice } from './invoiceStatus.ts';

export type PaymentStatusOutcome =
  | { outcome: 'RECORDED'; invoice: CustomerSafeInvoice }
  | { outcome: 'PARTIALLY_RECORDED'; invoice: CustomerSafeInvoice }
  | { outcome: 'NOT_RECORDED'; invoice: CustomerSafeInvoice }
  | { outcome: 'NOT_FOUND' };

export async function getCustomerOwnPaymentStatus(activeCustomerId: string, invoiceNumber: string): Promise<PaymentStatusOutcome> {
  const invoice = await getCustomerOwnInvoice(activeCustomerId, invoiceNumber);
  if (!invoice) return { outcome: 'NOT_FOUND' };
  if (invoice.status === 'PAID') return { outcome: 'RECORDED', invoice };
  if (invoice.status === 'PARTIALLY_PAID') return { outcome: 'PARTIALLY_RECORDED', invoice };
  return { outcome: 'NOT_RECORDED', invoice };
}
