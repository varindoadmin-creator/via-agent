import assert from 'node:assert/strict';
import { analyzeDataQuality } from '../lib/dataQuality/analyze.ts';

const issues = analyzeDataQuality({
  customers: [
    { contact_id: 'c1', contact_name: 'PT Demo', company_name: '', email: 'bad', phone: '12', mobile: '', npwp: '1234567890123456', status: 'active', salesperson: '', taxInformation: 'NPWP' },
    { contact_id: 'c2', contact_name: 'Demo, PT', company_name: '', email: '', phone: '', mobile: '', npwp: '1234567890123456', status: 'active', salesperson: 'Rina', taxInformation: 'NPWP' },
  ], invoices: [{ invoice_id: 'i1', invoice_number: 'INV-1', customer_id: 'missing', salesorder_id: 'so1' }],
  items: [{ item_id: 'item1', name: 'Widget', status: 'active', purchase_rate: 0 }], salesOrders: [],
  priceListMembership: { Bronze: new Set<string>(), Gold: new Set(['item1']) },
});
for (const check of ['duplicate_customers', 'missing_customer_information', 'invalid_contact_information', 'invoices_without_locations', 'items_missing_purchase_rates', 'items_missing_price_lists', 'document_relationships'])
  assert.ok(issues.some(issue => issue.check === check), `expected ${check}`);
assert.ok(issues.every(issue => issue.suggestedAction));
console.log(`Data-quality analysis: ${issues.length} findings across all 7 checks — PASS`);
