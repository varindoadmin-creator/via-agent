export interface OpenInvoice {
  invoice_id: string;
  invoice_number: string;
  customer_name: string;
  customer_id: string;
  date: string;
  due_date: string;
  total: number;
  balance: number;
}

type InvoicePage = {
  invoices?: Record<string, unknown>[];
  page_context?: { has_more_page?: boolean };
};

export type FetchInvoicePage = (status: string, page: number) => Promise<InvoicePage>;

const OPEN_STATUSES = ['unpaid', 'partially_paid', 'overdue'] as const;
const MAX_PAGES_PER_STATUS = 50;

function hasPositiveBalance(invoice: { balance?: unknown }): boolean {
  const balance = Number(invoice.balance || 0);
  return Number.isFinite(balance) && Math.round(balance) > 0;
}

/**
 * Load every open-invoice page required by reconciliation. Zoho may return an
 * overdue invoice through both `unpaid` and `overdue`, so records are
 * deliberately deduplicated by invoice ID.
 */
export async function collectOpenInvoices(fetchPage: FetchInvoicePage): Promise<OpenInvoice[]> {
  const merged = new Map<string, OpenInvoice>();

  for (const status of OPEN_STATUSES) {
    for (let page = 1; page <= MAX_PAGES_PER_STATUS; page++) {
      const response = await fetchPage(status, page);
      const batch = response.invoices || [];
      for (const raw of batch) {
        const invoiceId = String(raw.invoice_id || '');
        if (!invoiceId) continue;
        const invoice: OpenInvoice = {
          invoice_id: invoiceId,
          invoice_number: String(raw.invoice_number || ''),
          customer_name: String(raw.customer_name || ''),
          customer_id: String(raw.customer_id || ''),
          date: String(raw.date || ''),
          due_date: String(raw.due_date || ''),
          total: Number(raw.total || 0),
          balance: Number(raw.balance || 0),
        };
        if (hasPositiveBalance(invoice)) merged.set(invoiceId, invoice);
      }

      if (!response.page_context?.has_more_page) break;
    }
  }

  return Array.from(merged.values());
}
