// ─── Customer-scoped invoice status ──────────────────────────────────────────
// VIA Customer Operations Phase 7, brief sections 12-13, 34, 53: ownership is
// structural — getCustomerInvoiceByNumber's Zoho query is filtered by
// customer_id, so a wrong-customer invoice number returns null, never a
// "found but denied" signal (never even confirms existence).

import { getCustomerInvoiceByNumber } from '../zoho/invoices.ts';
import type { ZohoInvoice } from '../../types/zoho.ts';
import { normalizeInvoiceStatus, type CustomerSafeInvoiceStatusValue } from './statusNormalization.ts';

export interface CustomerSafeInvoice {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string | null;
  total: number;
  balanceDue: number;
  status: CustomerSafeInvoiceStatusValue;
  currency: string;
  invoiceId: string; // internal only — used to fetch the PDF, never sent to the customer as text
}

export function toSafeInvoice(invoice: ZohoInvoice): CustomerSafeInvoice {
  return {
    invoiceNumber: invoice.invoice_number,
    invoiceDate: invoice.date,
    dueDate: invoice.due_date ?? null,
    total: invoice.total,
    balanceDue: invoice.balance,
    status: normalizeInvoiceStatus(invoice.status, invoice.balance),
    currency: invoice.currency_code,
    invoiceId: invoice.invoice_id,
  };
}

export async function getCustomerOwnInvoice(activeCustomerId: string, invoiceNumber: string): Promise<CustomerSafeInvoice | null> {
  const invoice = await getCustomerInvoiceByNumber(activeCustomerId, invoiceNumber);
  return invoice ? toSafeInvoice(invoice) : null;
}
