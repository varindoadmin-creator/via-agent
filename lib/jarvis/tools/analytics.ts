import { tool } from '@openai/agents';
import { z } from 'zod';
import type { JarvisRunContext } from '@/lib/jarvis/context';
import { cached } from '@/lib/jarvis/cache';
import { calculateAverageOrderValue, calculateConcentration, calculateGrowth } from '@/lib/jarvis/intelligence/metrics';
import { buildExecutiveSalesAssessment } from '@/lib/jarvis/intelligence/executive';
import { compareObservedSales, identifyCustomerOpportunities, modelCustomerRecoveryScenario, recommendedActionsForOpportunities, type SalesObservation } from '@/lib/jarvis/intelligence/business';
import { getZohoApiBaseUrl, getZohoAccessToken, getZohoOrgId } from '@/lib/zoho/auth';
import { fetchWithRetry } from '@/lib/zoho/retry';

type Row = Record<string, unknown>;
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const period = z.object({ label: z.string().min(1).max(80), from: date, to: date });
const parameters = z.object({ current: period, comparison: period.optional() });
const comparisonParameters = z.object({ current: period, comparison: period });
const customerRecoveryParameters = comparisonParameters.extend({ customer: z.string().min(1).max(200), recovery_rate: z.number().min(0).max(1) });

export function validatePeriod(from: string, to: string) {
  const start = Date.parse(`${from}T00:00:00Z`), end = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) throw new Error('Invalid analytics date range.');
  if ((end - start) / 86_400_000 > 366) throw new Error('Analytics date range cannot exceed 366 days.');
}

export async function fetchInvoices(from: string, to: string): Promise<Row[]> {
  validatePeriod(from, to);
  const rows: Row[] = [];
  const token = await getZohoAccessToken();
  for (let page = 1; page <= 20; page++) {
    const url = `${getZohoApiBaseUrl()}/invoices?organization_id=${encodeURIComponent(getZohoOrgId())}&date_start=${from}&date_end=${to}&per_page=200&page=${page}`;
    const response = await fetchWithRetry(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` } }, { retries: 3, baseDelayMs: 2_000 });
    const body = await response.json() as Row;
    if (!response.ok) throw new Error(`Zoho invoice analytics failed (${response.status}).`);
    const batch = (body.invoices || []) as Row[];
    rows.push(...batch);
    if (batch.length < 200) break;
    if (page === 20) {
      throw new Error('Zoho invoice analytics exceeded the verified page coverage limit. Narrow the date range; no partial BI report was returned.');
    }
  }
  return rows.filter(row => !['draft', 'void'].includes(String(row.status || '').toLowerCase()));
}

function summarize(label: string, from: string, to: string, invoices: Row[]) {
  const revenue = invoices.reduce((sum, row) => sum + Number(row.sub_total || 0), 0);
  const group = (key: 'customer_name' | 'salesperson_name') => {
    const values = new Map<string, number>();
    for (const row of invoices) {
      const name = String(row[key] || 'Unassigned');
      values.set(name, (values.get(name) || 0) + Number(row.sub_total || 0));
    }
    return calculateConcentration([...values].map(([name, value]) => ({ name, value })));
  };
  return {
    label, from, to, revenue_before_ppn: revenue, invoice_count: invoices.length,
    average_invoice_value: calculateAverageOrderValue(revenue, invoices.length),
    customers: group('customer_name'), salespeople: group('salesperson_name'),
  };
}

export function observations(invoices: Row[]): SalesObservation[] {
  return invoices.map(invoice => ({
    invoiceId: String(invoice.invoice_id || ''), date: String(invoice.date || ''), revenue: Number(invoice.sub_total || 0),
    customer: String(invoice.customer_name || 'Unassigned'), salesperson: String(invoice.salesperson_name || 'Unassigned'),
  }));
}

export const analyzeSalesPeriodsTool = tool<typeof parameters, JarvisRunContext>({
  name: 'analyze_sales_periods',
  description: 'Calculate deterministic issued-invoice sales metrics for one date range and an optional comparison range using live Zoho Books. Returns revenue before PPN, invoice count, average invoice value, customer and salesperson concentration, and period growth. Use this for sales performance questions; do not calculate these metrics yourself.',
  parameters,
  async execute({ current, comparison }, context) {
    const currentInvoices = await cached(context, `analytics:invoices:${current.from}:${current.to}`, () => fetchInvoices(current.from, current.to));
    const currentSummary = summarize(current.label, current.from, current.to, currentInvoices);
    if (!comparison) return { source: 'Zoho Books issued invoices', basis: 'Draft and void invoices excluded; revenue is invoice subtotal before PPN.', current: currentSummary, comparison: null, revenue_growth: null };
    const comparisonInvoices = await cached(context, `analytics:invoices:${comparison.from}:${comparison.to}`, () => fetchInvoices(comparison.from, comparison.to));
    const comparisonSummary = summarize(comparison.label, comparison.from, comparison.to, comparisonInvoices);
    return {
      source: 'Zoho Books issued invoices',
      basis: 'Draft and void invoices excluded; revenue is invoice subtotal before PPN.',
      current: currentSummary,
      comparison: comparisonSummary,
      revenue_growth: calculateGrowth(currentSummary.revenue_before_ppn, comparisonSummary.revenue_before_ppn),
    };
  },
});

export const boardroomSalesBriefTool = tool<typeof parameters, JarvisRunContext>({
  name: 'boardroom_sales_brief',
  description: 'Build a deterministic executive sales brief for one period and an optional comparison period from live issued Zoho invoices. Returns facts, concerns, opportunities, prioritized actions, and KPIs. This is a sales brief only; it does not claim to include GP, cash, receivables, or inventory.',
  parameters,
  async execute({ current, comparison }, context) {
    const currentInvoices = await cached(context, `analytics:invoices:${current.from}:${current.to}`, () => fetchInvoices(current.from, current.to));
    const currentSummary = summarize(current.label, current.from, current.to, currentInvoices);
    const comparisonSummary = comparison
      ? summarize(comparison.label, comparison.from, comparison.to, await cached(context, `analytics:invoices:${comparison.from}:${comparison.to}`, () => fetchInvoices(comparison.from, comparison.to)))
      : undefined;
    const shape = (summary: ReturnType<typeof summarize>) => ({
      label: summary.label,
      revenue: summary.revenue_before_ppn,
      invoiceCount: summary.invoice_count,
      averageInvoiceValue: summary.average_invoice_value,
      topCustomerName: summary.customers.top[0]?.name,
      topCustomerShare: summary.customers.top[0]?.share,
      topSalespersonName: summary.salespeople.top[0]?.name,
      topSalespersonShare: summary.salespeople.top[0]?.share,
    });
    return {
      source: 'Zoho Books issued invoices',
      scope: 'SALES_ONLY',
      excluded_domains: ['gross_profit', 'cash', 'receivables', 'inventory', 'operations'],
      current: currentSummary,
      comparison: comparisonSummary || null,
      assessment: buildExecutiveSalesAssessment(shape(currentSummary), comparisonSummary ? shape(comparisonSummary) : undefined),
    };
  },
});

export const analyzeSalesDriversTool = tool<typeof comparisonParameters, JarvisRunContext>({
  name: 'analyze_sales_drivers',
  description: 'Compare two explicit, preferably equal-length, live Zoho Books issued-invoice periods and deterministically attribute the verified revenue movement to customer and salesperson changes. It identifies where change occurred, not the underlying cause.',
  parameters: comparisonParameters,
  async execute({ current, comparison }, context) {
    const [currentInvoices, comparisonInvoices] = await Promise.all([
      cached(context, `analytics:invoices:${current.from}:${current.to}`, () => fetchInvoices(current.from, current.to)),
      cached(context, `analytics:invoices:${comparison.from}:${comparison.to}`, () => fetchInvoices(comparison.from, comparison.to)),
    ]);
    return { source: 'Zoho Books issued invoices', basis: 'Draft and void invoices excluded; revenue is invoice subtotal before PPN.', ...(compareObservedSales(current, observations(currentInvoices), comparison, observations(comparisonInvoices))) };
  },
});

export const identifyCustomerOpportunitiesTool = tool<typeof comparisonParameters, JarvisRunContext>({
  name: 'identify_customer_opportunities',
  description: 'Identify customer follow-up candidates from two explicit comparable Zoho Books issued-invoice periods. Returns only declining or inactive customers, ranked by transparent revenue-at-risk and invoice-frequency signals. It does not contact customers or make credit decisions.',
  parameters: comparisonParameters,
  async execute({ current, comparison }, context) {
    const [currentInvoices, comparisonInvoices] = await Promise.all([
      cached(context, `analytics:invoices:${current.from}:${current.to}`, () => fetchInvoices(current.from, current.to)),
      cached(context, `analytics:invoices:${comparison.from}:${comparison.to}`, () => fetchInvoices(comparison.from, comparison.to)),
    ]);
    const opportunities = identifyCustomerOpportunities(observations(currentInvoices), observations(comparisonInvoices));
    return { source: 'Zoho Books issued invoices', basis: 'Draft and void invoices excluded. Decline is a comparison result, not a cause or credit decision.', current_period: current, comparison_period: comparison, candidates: opportunities.slice(0, 30), recommended_actions: recommendedActionsForOpportunities(opportunities), limitations: ['This v1 ranks customer revenue movement and invoice frequency only.', 'Product-level cross-sell and reorder-cycle recommendations require verified invoice-line history and are not inferred here.'] };
  },
});

export const runCustomerRecoveryScenarioTool = tool<typeof customerRecoveryParameters, JarvisRunContext>({
  name: 'run_customer_recovery_scenario',
  description: 'Run a deterministic, non-executing revenue-recovery scenario for one customer after comparing two explicit Zoho Books issued-invoice periods. The recovery rate is a user-supplied management assumption from 0 to 1; this is not a forecast and makes no changes.',
  parameters: customerRecoveryParameters,
  async execute({ current, comparison, customer, recovery_rate }, context) {
    const [currentInvoices, comparisonInvoices] = await Promise.all([
      cached(context, `analytics:invoices:${current.from}:${current.to}`, () => fetchInvoices(current.from, current.to)),
      cached(context, `analytics:invoices:${comparison.from}:${comparison.to}`, () => fetchInvoices(comparison.from, comparison.to)),
    ]);
    const candidates = identifyCustomerOpportunities(observations(currentInvoices), observations(comparisonInvoices));
    const candidate = candidates.find(row => row.customer.toLocaleUpperCase() === customer.trim().toLocaleUpperCase());
    if (!candidate) throw new Error('No declining or inactive customer matched that exact name in the supplied periods.');
    return { source: 'Zoho Books issued invoices plus user-supplied scenario assumption', current_period: current, comparison_period: comparison, scenario: modelCustomerRecoveryScenario(candidate, recovery_rate) };
  },
});
