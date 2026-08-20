export interface ViaFeature {
  section: string;
  label: string;
  path: string;
  capabilities: string[];
}

// JARVIS's searchable map of VIA. Keep this aligned with AppShell navigation.
export const VIA_FEATURES: ViaFeature[] = [
  { section: 'Main', label: 'Home', path: '/dashboard', capabilities: ['daily overview', 'automation health', 'duplicate customer alerts', 'scheduled tasks'] },
  { section: 'Main', label: 'JARVIS', path: '/jarvis', capabilities: ['business questions', 'prices', 'system stock', 'analytics', 'controlled sales order creation'] },
  { section: 'Main', label: 'Leads', path: '/leads', capabilities: ['sales leads', 'lead follow-up'] },
  { section: 'Items', label: 'Items', path: '/inventory', capabilities: ['active items', 'stock by location', 'item search', 'inventory exceptions'] },
  { section: 'Items', label: 'Price Lists', path: '/inventory/price-lists', capabilities: ['Zoho price lists', 'customer tiers', 'active items', 'Bronze Plus'] },
  { section: 'Inventory', label: 'Shipments', path: '/inventory/shipments', capabilities: ['shipments', 'out for delivery', 'shipment aging', 'delivery status'] },
  { section: 'Sales', label: 'Customers', path: '/customers', capabilities: ['customers', 'duplicates', 'merge customer', 'ignore duplicate', 'risk score', 'inactive customers', 'customer name cleanup', 'hub'] },
  { section: 'Sales', label: 'Sales Orders', path: '/shipments', capabilities: ['draft sales orders', 'pending approval', 'approved', 'confirmed not packaged', 'delivered not invoiced', 'purchase gap'] },
  { section: 'Sales', label: 'Invoices', path: '/print', capabilities: ['draft invoices', 'overdue invoices', 'stock readiness', 'mark invoice sent'] },
  { section: 'Sales', label: 'Invoice Tracker', path: '/sales/tax-invoices', capabilities: ['tax invoice PDF', 'attach tax invoice', 'invoice attachments'] },
  { section: 'Purchases', label: 'Purchase Orders', path: '/purchases', capabilities: ['purchase orders', 'PO coverage', 'replenishment', 'supplier recommendations', 'draft purchase proposals'] },
  { section: 'Purchases', label: 'MIRPO', path: '/purchases/mirpo', capabilities: ['600 sheet MIRPO', 'LAMITAK recommendations', '30 day sell-through', 'draft MIRPO'] },
  { section: 'Banking', label: 'Bank Reconciliation', path: '/reconcile', capabilities: ['bank statement', 'invoice matching', 'payment reconciliation'] },
  { section: 'Approvals', label: 'Sales Order Approval', path: '/approvals/so', capabilities: ['approve sales order'] },
  { section: 'Approvals', label: 'Purchase Order Approval', path: '/approvals/po', capabilities: ['approve purchase order', 'match PO to demand'] },
  { section: 'Requests', label: 'Samples', path: '/requests/samples', capabilities: ['sample requests', 'sample status'] },
  { section: 'Requests', label: 'Quotes', path: '/requests/quotes', capabilities: ['quote requests', 'quote status'] },
  { section: 'Requests', label: 'Catalogues', path: '/requests/catalogues', capabilities: ['catalogue requests'] },
  { section: 'Documents', label: 'Goods Collection Memo', path: '/documents/goods-collection-memo', capabilities: ['goods collection memo', 'collection document'] },
  { section: 'Reports', label: 'Sales Report', path: '/reports/sales', capabilities: ['monthly sales', 'sales report'] },
  { section: 'Reports', label: 'Purchases Report', path: '/reports/purchases', capabilities: ['monthly purchases', 'purchases report'] },
  { section: 'Reports', label: 'Commission', path: '/reports/commission', capabilities: ['team commission', 'discount commission', 'monthly GP commission', 'print commission PDF'] },
  { section: 'Reports', label: 'Business Analytics', path: '/reports/business-analytics', capabilities: ['growth', 'month comparison', 'business insights'] },
  { section: 'Reports', label: 'Gross Profit', path: '/reports/gross-profit', capabilities: ['gross profit by brand', 'gross profit by hub', 'gross profit by customer', 'brand revenue'] },
  { section: 'Reports', label: 'Google Ads', path: '/reports/google-ads', capabilities: ['LAMITAK ads', 'EDL ads', 'ad metrics'] },
  { section: 'Reports', label: 'Data Quality', path: '/reports/data-quality', capabilities: ['duplicate customers', 'missing data', 'invalid email', 'invalid phone', 'missing purchase rate', 'price list coverage'] },
];

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function findViaFeatures(query: string, limit = 3): ViaFeature[] {
  const words = normalize(query).split(' ').filter(word => word.length > 2);
  return VIA_FEATURES.map(feature => {
    const label = normalize(`${feature.section} ${feature.label}`);
    const capabilities = normalize(feature.capabilities.join(' '));
    const score = words.reduce((total, word) => total + (label.includes(word) ? 3 : capabilities.includes(word) ? 1 : 0), 0);
    return { feature, score };
  }).filter(row => row.score > 0).sort((a, b) => b.score - a.score).slice(0, limit).map(row => row.feature);
}

export const VIA_FEATURE_KNOWLEDGE = VIA_FEATURES
  .map(feature => `- **${feature.section} → ${feature.label}** (${feature.path}) — ${feature.capabilities.join(', ')}.`)
  .join('\n');
