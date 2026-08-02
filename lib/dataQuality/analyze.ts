import { findDuplicateGroups, type DuplicateCandidate } from '../customerCleanup/duplicates.ts';

export type DataQualityCheck =
  | 'duplicate_customers' | 'missing_customer_information' | 'invalid_contact_information'
  | 'invoices_without_locations' | 'items_missing_purchase_rates'
  | 'items_missing_price_lists' | 'document_relationships';

export type DataQualitySeverity = 'high' | 'medium' | 'low';

export interface DataQualityIssue {
  id: string;
  check: DataQualityCheck;
  severity: DataQualitySeverity;
  entityType: 'customer' | 'invoice' | 'item' | 'document';
  entityId: string;
  entityName: string;
  message: string;
  evidence: string;
  suggestedAction: string;
}

export interface QualityCustomer extends DuplicateCandidate {
  salesperson?: string;
  taxInformation?: string;
}
export interface QualityInvoice {
  invoice_id: string; invoice_number?: string; customer_id?: string; customer_name?: string;
  salesperson_name?: string; location_id?: string; location_name?: string;
  salesorder_id?: string; salesorder_number?: string;
}
export interface QualityItem { item_id: string; name?: string; sku?: string; status?: string; purchase_rate?: number | string }
export interface QualitySalesOrder { salesorder_id: string; salesorder_number?: string; customer_id?: string }

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function validPhone(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15;
}

export function analyzeDataQuality(input: {
  customers: QualityCustomer[];
  invoices: QualityInvoice[];
  items: QualityItem[];
  salesOrders: QualitySalesOrder[];
  priceListMembership: Record<string, Set<string>>;
}): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];
  const add = (issue: Omit<DataQualityIssue, 'id'>) => issues.push({ ...issue, id: `${issue.check}:${issue.entityId}:${issues.length}` });

  for (const group of findDuplicateGroups(input.customers)) {
    for (const customer of group.customers) add({
      check: 'duplicate_customers', severity: 'medium', entityType: 'customer', entityId: customer.contact_id,
      entityName: customer.company_name || customer.contact_name, message: 'Possible duplicate customer',
      evidence: `${group.customers.length} records match: ${group.reasons.join(', ')}`,
      suggestedAction: 'Review the matching records and merge them manually in Zoho Books if appropriate.',
    });
  }

  for (const customer of input.customers.filter(c => !c.status || c.status === 'active')) {
    const missing = [!customer.salesperson && 'salesperson', !customer.taxInformation && 'tax information'].filter(Boolean) as string[];
    if (missing.length) add({
      check: 'missing_customer_information', severity: 'medium', entityType: 'customer', entityId: customer.contact_id,
      entityName: customer.company_name || customer.contact_name, message: `Missing ${missing.join(' and ')}`,
      evidence: `Active customer has no ${missing.join(' or ')} on record.`, suggestedAction: 'Complete the customer record in Zoho Books.',
    });
    const invalid = [customer.email && !emailPattern.test(customer.email.trim()) && `email: ${customer.email}`,
      customer.phone && !validPhone(customer.phone) && `phone: ${customer.phone}`,
      customer.mobile && !validPhone(customer.mobile) && `mobile: ${customer.mobile}`].filter(Boolean) as string[];
    if (invalid.length) add({
      check: 'invalid_contact_information', severity: 'low', entityType: 'customer', entityId: customer.contact_id,
      entityName: customer.company_name || customer.contact_name, message: 'Invalid contact format', evidence: invalid.join('; '),
      suggestedAction: 'Verify the email or phone number with the salesperson before correcting it.',
    });
  }

  const customerIds = new Set(input.customers.map(c => c.contact_id));
  const itemIds = new Set(input.items.map(i => i.item_id));
  const salesOrders = new Map(input.salesOrders.map(s => [s.salesorder_id, s]));
  for (const invoice of input.invoices) {
    const name = invoice.invoice_number || invoice.invoice_id;
    if (!invoice.location_id && !invoice.location_name) add({
      check: 'invoices_without_locations', severity: 'high', entityType: 'invoice', entityId: invoice.invoice_id, entityName: name,
      message: 'Invoice has no location', evidence: `Customer: ${invoice.customer_name || invoice.customer_id || 'Unknown'}`,
      suggestedAction: 'Assign the correct warehouse/location in Zoho Books.',
    });
    if (invoice.customer_id && !customerIds.has(invoice.customer_id)) add({
      check: 'document_relationships', severity: 'high', entityType: 'document', entityId: invoice.invoice_id, entityName: name,
      message: 'Invoice references an unknown customer', evidence: `Customer ID ${invoice.customer_id} is absent from the customer list.`,
      suggestedAction: 'Check whether the customer is inactive/deleted and repair the document relationship in Zoho Books.',
    });
    if (invoice.salesorder_id) {
      const so = salesOrders.get(invoice.salesorder_id);
      if (!so) add({
        check: 'document_relationships', severity: 'medium', entityType: 'document', entityId: invoice.invoice_id, entityName: name,
        message: 'Invoice references an unavailable sales order', evidence: `Sales order ${invoice.salesorder_number || invoice.salesorder_id} was not found in the scan.`,
        suggestedAction: 'Review the linked sales order in Zoho Books.',
      });
      else if (so.customer_id && invoice.customer_id && so.customer_id !== invoice.customer_id) add({
        check: 'document_relationships', severity: 'high', entityType: 'document', entityId: invoice.invoice_id, entityName: name,
        message: 'Invoice and sales order customers differ', evidence: `Invoice customer ${invoice.customer_id}; sales order customer ${so.customer_id}.`,
        suggestedAction: 'Review both documents before processing or collecting payment.',
      });
    }
  }

  for (const item of input.items.filter(i => !i.status || i.status === 'active')) {
    const name = item.name || item.sku || item.item_id;
    const rate = Number(item.purchase_rate || 0);
    if (!(rate > 0)) add({
      check: 'items_missing_purchase_rates', severity: 'high', entityType: 'item', entityId: item.item_id, entityName: name,
      message: 'Active item has no purchase rate', evidence: `Purchase rate: ${item.purchase_rate ?? 'blank'}`,
      suggestedAction: 'Enter a verified purchase rate in Zoho Books so margin calculations remain reliable.',
    });
    if (!itemIds.has(item.item_id)) continue;
    const missingLists = Object.entries(input.priceListMembership).filter(([, ids]) => !ids.has(item.item_id)).map(([tier]) => tier);
    if (missingLists.length) add({
      check: 'items_missing_price_lists', severity: 'medium', entityType: 'item', entityId: item.item_id, entityName: name,
      message: 'Active item is absent from required price lists', evidence: missingLists.join(', '),
      suggestedAction: 'Review the item and run the Price List Sync after confirming its pricing rule.',
    });
  }
  return issues.sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.severity] - ({ high: 0, medium: 1, low: 2 }[b.severity]) || a.entityName.localeCompare(b.entityName)));
}
