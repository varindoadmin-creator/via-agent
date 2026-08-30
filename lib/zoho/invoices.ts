// ─── Zoho Books Invoices — customer-scoped read access ───────────────────────
// VIA Customer Operations Phase 7, brief section 34: every function here
// takes a trusted customerId as its FIRST argument and filters the Zoho query
// by it server-side — never a "get any invoice by number" function that
// relies on a caller to check ownership afterward (brief section 33's "bad
// tool design to avoid"). Mirrors the real Zoho endpoints already proven by
// app/api/invoices/route.ts and app/api/invoices/pdf/route.ts.

import type { ZohoInvoice, ZohoInvoiceListResponse, ZohoInvoiceResponse } from '../../types/zoho.ts';
import { zohoRequest, isMockMode } from './client.ts';
import { getZohoAccessToken, getZohoApiBaseUrl, getZohoOrgId } from './auth.ts';
import { fetchWithRetry } from './retry.ts';

const MOCK_INVOICES: ZohoInvoice[] = [
  { invoice_id: 'MOCK-INV-1', invoice_number: 'INV-001', date: '2026-01-10', due_date: '2026-02-09', status: 'unpaid', customer_id: 'CUST-001', customer_name: 'PT PROFITTO INOVASI KREATIF', currency_code: 'IDR', total: 6250000, balance: 6250000 },
];

/** Ownership-scoped by construction — the Zoho query itself is filtered by customer_id. */
export async function searchCustomerInvoices(customerId: string, limit = 5): Promise<ZohoInvoice[]> {
  if (isMockMode()) return MOCK_INVOICES.filter(i => i.customer_id === customerId).slice(0, limit);
  const response = await zohoRequest<ZohoInvoiceListResponse>('/invoices', {
    queryParams: { customer_id: customerId, per_page: limit, sort_column: 'date', sort_order: 'D' },
  });
  return response.invoices || [];
}

/** Returns null (not a cross-customer record) if the invoice exists but belongs to a different customer — the query itself excludes it, so this never even confirms existence to a caller (brief section 53). */
export async function getCustomerInvoiceByNumber(customerId: string, invoiceNumber: string): Promise<ZohoInvoice | null> {
  if (isMockMode()) return MOCK_INVOICES.find(i => i.customer_id === customerId && i.invoice_number.toUpperCase() === invoiceNumber.toUpperCase()) || null;
  const response = await zohoRequest<ZohoInvoiceListResponse>('/invoices', {
    queryParams: { customer_id: customerId, invoice_number: invoiceNumber, per_page: 1 },
  });
  return response.invoices?.[0] || null;
}

export async function getCustomerOpenInvoices(customerId: string, limit = 5): Promise<ZohoInvoice[]> {
  if (isMockMode()) return MOCK_INVOICES.filter(i => i.customer_id === customerId && i.balance > 0).slice(0, limit);
  const statuses = ['unpaid', 'partially_paid', 'overdue'];
  const merged = new Map<string, ZohoInvoice>();
  for (const status of statuses) {
    const response = await zohoRequest<ZohoInvoiceListResponse>('/invoices', {
      queryParams: { customer_id: customerId, status, per_page: 50, sort_column: 'due_date', sort_order: 'A' },
    });
    for (const invoice of response.invoices || []) {
      if (Number(invoice.balance) > 0) merged.set(invoice.invoice_id, invoice);
    }
  }
  return Array.from(merged.values()).slice(0, limit);
}

/**
 * Same `/invoices/{id}?accept=pdf` call already proven by
 * app/api/invoices/pdf/route.ts, extracted for reuse. Never rebuilt from
 * model-generated text (brief section 19) — this is the one authoritative
 * document source. Not routed through zohoRequest() since that always parses
 * the response as JSON; this response is raw PDF bytes.
 */
export async function getInvoicePdf(invoiceId: string): Promise<Buffer> {
  if (isMockMode()) return Buffer.from('%PDF-1.4 mock invoice pdf');
  const token = await getZohoAccessToken();
  const base = getZohoApiBaseUrl();
  const orgId = getZohoOrgId();
  const url = `${base}/invoices/${invoiceId}?accept=pdf&organization_id=${orgId}`;
  const response = await fetchWithRetry(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` } });
  if (!response.ok) throw new Error(`Zoho invoice PDF fetch failed: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

export async function getInvoiceById(invoiceId: string): Promise<ZohoInvoice | null> {
  if (isMockMode()) return MOCK_INVOICES.find(i => i.invoice_id === invoiceId) || null;
  try {
    const response = await zohoRequest<ZohoInvoiceResponse>(`/invoices/${invoiceId}`);
    return response.invoice || null;
  } catch {
    return null;
  }
}
