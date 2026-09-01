// ─── Governed metric registry (Phase 12) ──────────────────────────────────────
// VIA Phase 12, brief section 3: one place every metric's formula, grain,
// source, currency basis, owner, freshness, and classification is documented
// — not a new compute layer. Phase 9's `lib/analytics/metricRegistry.ts` and
// Phase 11's proactive layer already govern the WATI/commercial-ops metrics;
// the pre-existing `lib/jarvis/intelligence/business.ts` already governs the
// Zoho-accounting metrics (revenue, GP, receivables). This registry indexes
// both under one shape (`computedBy` points at the real implementation —
// never a duplicate formula) plus the handful of metrics genuinely new to
// this phase (cash collected, customer reorder rate, quotation value).
//
// Brief section 4's non-negotiable: Quotation Value, Sales Order Value,
// Invoice Value/Accounting Revenue, and Cash Collected are five DIFFERENT
// metrics below — never collapsed into one "sales" or "revenue" number.

export type MetricGrain = 'EVENT' | 'DAY' | 'WEEK' | 'MONTH' | 'QUARTER' | 'YEAR';
export type MetricSource = 'Zoho Books' | 'VIA' | 'Zoho Books + VIA';
export type MetricOwner = 'SALES' | 'FINANCE' | 'OPERATIONS' | 'MANAGEMENT' | 'CUSTOMER_SERVICE';
export type MetricFreshness = 'LIVE' | 'NEAR_REAL_TIME' | 'DAILY_SYNC';
export type MetricClassification = 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL';

export interface GovernedMetricDefinition {
  metricId: string;
  name: string;
  businessDefinition: string;
  formula: string;
  grain: MetricGrain;
  source: MetricSource;
  filters: string[];
  timeBasis: string;
  currencyBasis: 'IDR' | 'TRANSACTION_CURRENCY';
  owner: MetricOwner;
  freshness: MetricFreshness;
  classification: MetricClassification;
  version: number;
  /** Where this is actually computed — `file.ts#exportName` — never re-implemented here. */
  computedBy: string;
}

export const GOVERNED_METRIC_REGISTRY: readonly GovernedMetricDefinition[] = [
  // ── Revenue terminology (brief section 4) — five distinct metrics, never one "sales" figure ──
  {
    metricId: 'quotation_value', name: 'Quotation Value',
    businessDefinition: 'Total value of quotations (Zoho Estimates) prepared through VIA, whether or not the customer has accepted.',
    formula: 'sum(commercial_drafts.total where type=QUOTATION and zoho_object_id is not null)',
    grain: 'DAY', source: 'VIA', filters: ['type=QUOTATION', 'zoho_object_id not null'],
    timeBasis: 'commercial_drafts.created_at', currencyBasis: 'IDR', owner: 'SALES', freshness: 'LIVE',
    classification: 'INTERNAL', version: 1, computedBy: 'lib/analytics/funnel.ts#getCommercialFunnel (quotationValue)',
  },
  {
    metricId: 'sales_order_value', name: 'Sales Order Value',
    businessDefinition: 'Total confirmed value of Sales Orders executed through VIA — a commitment to sell, not yet invoiced or collected.',
    formula: 'sum(commercial_drafts.total where type=SALES_ORDER and zoho_object_id is not null)',
    grain: 'DAY', source: 'VIA', filters: ['type=SALES_ORDER', 'zoho_object_id not null'],
    timeBasis: 'commercial_drafts.created_at', currencyBasis: 'IDR', owner: 'SALES', freshness: 'LIVE',
    classification: 'INTERNAL', version: 1, computedBy: 'lib/analytics/metricRegistry.ts#sales_order_value',
  },
  {
    metricId: 'invoiced_sales', name: 'Invoiced Sales (Accounting Revenue)',
    businessDefinition: 'Revenue recognized in Zoho Books via issued invoices, before PPN. This is the only metric that may be called "revenue" — it is never the same number as Sales Order Value, since an order can be invoiced later, partially, or not at all.',
    formula: 'sum(issued invoice.sub_total) — draft and void invoices excluded',
    grain: 'DAY', source: 'Zoho Books', filters: ['status not in (draft, void)'],
    timeBasis: 'invoice.date', currencyBasis: 'IDR', owner: 'FINANCE', freshness: 'LIVE',
    classification: 'CONFIDENTIAL', version: 1, computedBy: 'lib/jarvis/intelligence/business.ts#summarizeObservedSales (revenue_before_ppn)',
  },
  {
    metricId: 'cash_collected', name: 'Cash Collected',
    businessDefinition: 'Actual customer payments received in Zoho Books in the period — distinct from invoiced sales, which only reflects what was billed, not what was paid.',
    formula: 'sum(customerpayments.amount where date in range)',
    grain: 'DAY', source: 'Zoho Books', filters: [],
    timeBasis: 'customerpayment.date', currencyBasis: 'IDR', owner: 'FINANCE', freshness: 'LIVE',
    classification: 'CONFIDENTIAL', version: 1, computedBy: 'lib/metrics/cashCollected.ts#getCashCollected',
  },
  {
    metricId: 'open_receivables', name: 'Open Receivables',
    businessDefinition: 'Total unpaid/partially-paid/overdue invoice balance as of now — money billed but not yet collected.',
    formula: 'sum(invoice.balance where status in (unpaid, partially_paid, overdue))',
    grain: 'EVENT', source: 'Zoho Books', filters: ['status in (unpaid, partially_paid, overdue)'],
    timeBasis: 'as-of now (Asia/Jakarta)', currencyBasis: 'IDR', owner: 'FINANCE', freshness: 'LIVE',
    classification: 'CONFIDENTIAL', version: 1, computedBy: 'lib/jarvis/intelligence/receivables.ts#summarizeReceivables',
  },

  // ── Conversion / funnel ──
  {
    metricId: 'quotation_conversion_rate', name: 'Quotation Conversion Rate',
    businessDefinition: 'Share of non-draft, non-cancelled commercial drafts that reached an executed Sales Order.',
    formula: 'executed SO drafts / (drafts where status not in (DRAFT, CANCELLED))',
    grain: 'DAY', source: 'VIA', filters: [],
    timeBasis: 'commercial_drafts.created_at', currencyBasis: 'IDR', owner: 'SALES', freshness: 'LIVE',
    classification: 'INTERNAL', version: 1, computedBy: 'lib/analytics/metricRegistry.ts#draft_to_order_conversion',
  },
  {
    metricId: 'average_order_value', name: 'Average Order Value',
    businessDefinition: 'Mean Sales Order value across executed orders in the period.',
    formula: 'sales_order_value / order_count', grain: 'DAY', source: 'VIA', filters: [],
    timeBasis: 'commercial_drafts.created_at', currencyBasis: 'IDR', owner: 'SALES', freshness: 'LIVE',
    classification: 'INTERNAL', version: 1, computedBy: 'lib/jarvis/intelligence/metrics.ts#calculateAverageOrderValue',
  },
  {
    metricId: 'customer_reorder_rate', name: 'Customer Reorder Rate',
    businessDefinition: 'Share of customers with at least 3 historical orders of the same item whose next order arrives close to their own historical cadence.',
    formula: 'see lib/metrics/retention.ts and lib/zoho/purchaseHistory.ts#getCustomerItemPurchaseCadence',
    grain: 'MONTH', source: 'Zoho Books', filters: ['orderCount >= 3'],
    timeBasis: 'salesorder.date', currencyBasis: 'IDR', owner: 'SALES', freshness: 'NEAR_REAL_TIME',
    classification: 'INTERNAL', version: 1, computedBy: 'lib/zoho/purchaseHistory.ts#getCustomerItemPurchaseCadence',
  },

  // ── Profitability (INTERNAL/CONFIDENTIAL — brief section 19) ──
  {
    metricId: 'gross_profit_current_rate', name: 'Gross Profit (current purchase-rate basis)',
    businessDefinition: 'Invoice line revenue minus current Zoho item purchase rate × invoiced quantity — not historical landed-cost accounting.',
    formula: 'invoice line revenue - (current item purchase_rate × invoiced quantity)',
    grain: 'MONTH', source: 'Zoho Books', filters: ['status not in (draft, void)'],
    timeBasis: 'invoice.date', currencyBasis: 'IDR', owner: 'FINANCE', freshness: 'LIVE',
    classification: 'CONFIDENTIAL', version: 1, computedBy: 'lib/jarvis/tools/financeOperations.ts#grossProfit',
  },
] as const;

export function getGovernedMetric(metricId: string): GovernedMetricDefinition | undefined {
  return GOVERNED_METRIC_REGISTRY.find(m => m.metricId === metricId);
}

export function listGovernedMetrics(owner?: MetricOwner): readonly GovernedMetricDefinition[] {
  return owner ? GOVERNED_METRIC_REGISTRY.filter(m => m.owner === owner) : GOVERNED_METRIC_REGISTRY;
}

/** Brief section 45/11: never expose a CONFIDENTIAL metric definition to an external/customer-facing audience. External Jarvis never imports this module at all (same structural guarantee as every other internal-only registry), this is defense in depth. */
export function isExternallyDisclosable(metric: GovernedMetricDefinition): boolean {
  return metric.classification === 'PUBLIC';
}
