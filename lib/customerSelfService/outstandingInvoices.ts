// ─── Customer-scoped outstanding invoices / receivable summary ──────────────
// VIA Customer Operations Phase 7, brief sections 14, 23-24: deterministic
// arithmetic over that customer's own open invoices only — never overall
// Varindo AR (which stays INTERNAL, denied by the existing
// INTERNAL_METRIC_INQUIRY/COMPANY_SALES handling, unchanged by this phase).

import { getCustomerOpenInvoices } from '../zoho/invoices.ts';
import { toSafeInvoice, type CustomerSafeInvoice } from './invoiceStatus.ts';

export async function getCustomerOutstandingInvoices(activeCustomerId: string, limit = 5): Promise<CustomerSafeInvoice[]> {
  const invoices = await getCustomerOpenInvoices(activeCustomerId, limit);
  return invoices.map(toSafeInvoice);
}

export interface CustomerReceivableSummary {
  totalOutstanding: number;
  currency: string;
  invoiceCount: number;
}

/** Sums only this customer's own open-invoice balances — brief section 24: company-wide AR is never exposed here. */
export async function getCustomerReceivableSummary(activeCustomerId: string): Promise<CustomerReceivableSummary> {
  const invoices = await getCustomerOpenInvoices(activeCustomerId, 200);
  const totalOutstanding = invoices.reduce((sum, inv) => sum + Number(inv.balance || 0), 0);
  return { totalOutstanding, currency: invoices[0]?.currency_code || 'IDR', invoiceCount: invoices.length };
}
