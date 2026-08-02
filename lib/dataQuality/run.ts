import { zohoRequest } from '@/lib/zoho/client';
import { getPricebookIdByTier, PRICE_LIST_TIERS } from '@/lib/zoho/pricebookConfig';
import { analyzeDataQuality, type QualityCustomer, type QualityInvoice, type QualityItem, type QualitySalesOrder } from './analyze';

async function allPages<T>(path: string, key: string, query: Record<string, string | number> = {}): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 1; page <= 30; page++) {
    const response = await zohoRequest<Record<string, unknown>>(path, { queryParams: { ...query, per_page: 200, page } });
    rows.push(...(((response[key] as T[]) || [])));
    const context = response.page_context as { has_more_page?: boolean } | undefined;
    if (!context?.has_more_page) break;
  }
  return rows;
}

export async function runDataQualityMonitor() {
  const [rawCustomers, invoices, items, salesOrders, pricebooks] = await Promise.all([
    allPages<QualityCustomer>('/contacts', 'contacts', { contact_type: 'customer' }),
    allPages<QualityInvoice>('/invoices', 'invoices'),
    allPages<QualityItem>('/items', 'items', { status: 'active' }),
    allPages<QualitySalesOrder>('/salesorders', 'salesorders'),
    Promise.all(PRICE_LIST_TIERS.map(async tier => {
      const response = await zohoRequest<{ pricebook?: { pricebook_items?: Array<{ item_id: string }> } }>(`/pricebooks/${getPricebookIdByTier(tier)}`);
      return [tier, new Set((response.pricebook?.pricebook_items || []).map(item => item.item_id))] as const;
    })),
  ]);

  const salespersonByCustomer = new Map(invoices.filter(invoice => invoice.customer_id && invoice.salesperson_name).map(invoice => [invoice.customer_id!, invoice.salesperson_name!]));
  const customers = rawCustomers.map(customer => {
    const raw = customer as QualityCustomer & Record<string, unknown>;
    const hash = (raw.custom_field_hash || {}) as Record<string, unknown>;
    const invoiceSalesperson = salespersonByCustomer.get(customer.contact_id);
    return { ...customer,
      salesperson: String(raw.salesperson_name || raw.salesperson || raw.cf_salesperson || hash.cf_salesperson || invoiceSalesperson || ''),
      taxInformation: String(raw.tax_id || raw.tax_name || raw.tax_treatment || raw.vat_treatment || raw.cf_npwp || hash.cf_npwp || ''),
      npwp: String(raw.npwp || raw.cf_npwp || hash.cf_npwp || ''),
    };
  });

  const issues = analyzeDataQuality({ customers, invoices, items, salesOrders, priceListMembership: Object.fromEntries(pricebooks) });
  const checks = Object.fromEntries([
    'duplicate_customers', 'missing_customer_information', 'invalid_contact_information', 'invoices_without_locations',
    'items_missing_purchase_rates', 'items_missing_price_lists', 'document_relationships',
  ].map(check => [check, issues.filter(issue => issue.check === check).length]));
  return {
    generated_at: new Date().toISOString(), issues, checks,
    severity: { high: issues.filter(i => i.severity === 'high').length, medium: issues.filter(i => i.severity === 'medium').length, low: issues.filter(i => i.severity === 'low').length },
    scanned: { customers: customers.length, invoices: invoices.length, active_items: items.length, sales_orders: salesOrders.length, required_price_lists: PRICE_LIST_TIERS.length },
    advisory_only: true,
  };
}
