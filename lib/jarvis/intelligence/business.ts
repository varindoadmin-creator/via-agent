/**
 * Deterministic business-intelligence primitives used by JARVIS.
 *
 * These functions intentionally accept already-retrieved records.  They do
 * not call an LLM and do not mutate Zoho, which makes formulas reviewable and
 * safe to test independently from the conversational layer.
 */
import { calculateGrowth } from './metrics.ts';

export type EvidenceSource = 'Zoho Books' | 'VIA';

export interface MetricDefinition {
  id: string;
  label: string;
  formula: string;
  source: EvidenceSource;
  fields: string[];
  limitations: string[];
  version: '1.0';
}

export const BUSINESS_METRIC_REGISTRY: MetricDefinition[] = [
  { id: 'revenue_before_ppn', label: 'Revenue before PPN', formula: 'sum(issued invoice.sub_total)', source: 'Zoho Books', fields: ['invoice.status', 'invoice.sub_total', 'invoice.date'], limitations: ['Draft and void invoices are excluded.'], version: '1.0' },
  { id: 'invoice_count', label: 'Issued invoice count', formula: 'count(issued invoices)', source: 'Zoho Books', fields: ['invoice.status', 'invoice.invoice_id'], limitations: ['Invoice count is not order count.'], version: '1.0' },
  { id: 'average_invoice_value', label: 'Average invoice value', formula: 'revenue_before_ppn / issued invoice count', source: 'Zoho Books', fields: ['invoice.sub_total', 'invoice.invoice_id'], limitations: ['Null when there are no issued invoices.'], version: '1.0' },
  { id: 'gross_profit_current_rate', label: 'Gross profit (current purchase-rate basis)', formula: 'invoice line revenue - current item purchase rate × invoiced quantity', source: 'Zoho Books', fields: ['invoice.line_items', 'item.purchase_rate'], limitations: ['Not historical landed-cost accounting.'], version: '1.0' },
  { id: 'receivable_overdue', label: 'Overdue receivables', formula: 'sum(open invoice balance where due_date < as_of)', source: 'Zoho Books', fields: ['invoice.balance', 'invoice.due_date', 'invoice.status'], limitations: ['Missing due dates are reported separately.'], version: '1.0' },
  { id: 'days_of_system_stock', label: 'Days of system stock', formula: 'available system stock / average daily sales velocity', source: 'Zoho Books', fields: ['item.available_stock', 'sales_by_item.quantity_sold'], limitations: ['System stock is not physical stock; no lead-time claim.'], version: '1.0' },
];

export interface SalesObservation {
  invoiceId?: string;
  date: string;
  revenue: number;
  customer?: string;
  salesperson?: string;
}

export interface PeriodDefinition { label: string; from: string; to: string; }
export interface Contribution { name: string; current: number; comparison: number; change: number; contribution_to_change: number | null; }

function number(value: unknown): number { const result = Number(value); return Number.isFinite(result) ? result : 0; }
function name(value: unknown, fallback = 'Unassigned'): string { const result = String(value || '').trim(); return result || fallback; }

export function summarizeObservedSales(period: PeriodDefinition, rows: SalesObservation[]) {
  const revenue = rows.reduce((sum, row) => sum + number(row.revenue), 0);
  return {
    ...period,
    revenue_before_ppn: revenue,
    invoice_count: rows.length,
    average_invoice_value: rows.length ? revenue / rows.length : null,
    source: 'Zoho Books' as const,
    basis: 'Issued invoices only; revenue is subtotal before PPN.',
  };
}

function grouped(rows: SalesObservation[], key: 'customer' | 'salesperson'): Map<string, number> {
  const result = new Map<string, number>();
  for (const row of rows) {
    const group = name(row[key]);
    result.set(group, (result.get(group) || 0) + number(row.revenue));
  }
  return result;
}

/** Attribute a known revenue movement to customer or salesperson groups. */
export function decomposeSalesChange(current: SalesObservation[], comparison: SalesObservation[], key: 'customer' | 'salesperson'): Contribution[] {
  const now = grouped(current, key), then = grouped(comparison, key);
  const totalChange = [...now.values()].reduce((a, b) => a + b, 0) - [...then.values()].reduce((a, b) => a + b, 0);
  const names = new Set([...now.keys(), ...then.keys()]);
  return [...names].map(group => {
    const currentValue = now.get(group) || 0, comparisonValue = then.get(group) || 0, change = currentValue - comparisonValue;
    return { name: group, current: currentValue, comparison: comparisonValue, change, contribution_to_change: totalChange === 0 ? null : change / totalChange };
  }).sort((a, b) => Math.abs(b.change) - Math.abs(a.change) || a.name.localeCompare(b.name));
}

export function compareObservedSales(currentPeriod: PeriodDefinition, current: SalesObservation[], comparisonPeriod: PeriodDefinition, comparison: SalesObservation[]) {
  const currentSummary = summarizeObservedSales(currentPeriod, current);
  const comparisonSummary = summarizeObservedSales(comparisonPeriod, comparison);
  return {
    current: currentSummary,
    comparison: comparisonSummary,
    revenue_change: currentSummary.revenue_before_ppn - comparisonSummary.revenue_before_ppn,
    revenue_growth: calculateGrowth(currentSummary.revenue_before_ppn, comparisonSummary.revenue_before_ppn),
    drivers: {
      customer: decomposeSalesChange(current, comparison, 'customer').slice(0, 15),
      salesperson: decomposeSalesChange(current, comparison, 'salesperson').slice(0, 15),
    },
    interpretation_limit: 'Driver attribution identifies where revenue changed. It does not prove why it changed.',
  };
}

export interface CustomerOpportunity {
  customer: string;
  recent_revenue: number;
  prior_revenue: number;
  revenue_change: number;
  revenue_growth: number | null;
  recent_invoices: number;
  prior_invoices: number;
  segment: 'declining' | 'inactive' | 'growing' | 'stable';
  priority_score: number;
  rationale: string[];
  evidence: string[];
}

/**
 * Ranks customer follow-up candidates from two equal observed windows. Scores
 * are transparent: revenue at risk plus an invoice-frequency signal, and are
 * advisory only—not credit or eligibility decisions.
 */
export function identifyCustomerOpportunities(recent: SalesObservation[], prior: SalesObservation[]): CustomerOpportunity[] {
  const recentRevenue = grouped(recent, 'customer'), priorRevenue = grouped(prior, 'customer');
  const counts = (rows: SalesObservation[]) => {
    const result = new Map<string, number>();
    for (const row of rows) { const customer = name(row.customer); result.set(customer, (result.get(customer) || 0) + 1); }
    return result;
  };
  const recentCount = counts(recent), priorCount = counts(prior);
  const customers = new Set([...recentRevenue.keys(), ...priorRevenue.keys()]);
  return [...customers].map(customer => {
    const now = recentRevenue.get(customer) || 0, before = priorRevenue.get(customer) || 0;
    const change = now - before, growth = calculateGrowth(now, before);
    const recentInvoices = recentCount.get(customer) || 0, priorInvoices = priorCount.get(customer) || 0;
    const inactive = before > 0 && now === 0;
    const declining = before > 0 && change < 0;
    const growing = before > 0 && change > 0;
    const segment: CustomerOpportunity['segment'] = inactive ? 'inactive' : declining ? 'declining' : growing ? 'growing' : 'stable';
    const atRisk = Math.max(0, -change);
    const frequencySignal = Math.max(0, priorInvoices - recentInvoices);
    const rationale = inactive ? ['No issued-invoice revenue in the recent window after prior-period purchases.']
      : declining ? ['Revenue is below the comparable prior window.']
      : growing ? ['Revenue is above the comparable prior window.'] : ['No material directional revenue movement was detected.'];
    if (frequencySignal > 0) rationale.push('Invoice frequency is lower than the prior window.');
    return { customer, recent_revenue: now, prior_revenue: before, revenue_change: change, revenue_growth: growth, recent_invoices: recentInvoices, prior_invoices: priorInvoices, segment, priority_score: atRisk + (frequencySignal * (before / Math.max(priorInvoices, 1))), rationale, evidence: ['Zoho Books issued invoices', 'Two comparable supplied date windows'] };
  }).filter(row => row.segment === 'inactive' || row.segment === 'declining')
    .sort((a, b) => b.priority_score - a.priority_score || a.customer.localeCompare(b.customer));
}

export interface RecoveryScenario { customer: string; revenue_at_risk: number; recovery_rate: number; estimated_recovered_revenue: number; assumptions: string[]; }
export function modelCustomerRecoveryScenario(candidate: CustomerOpportunity, recoveryRate: number): RecoveryScenario {
  if (!Number.isFinite(recoveryRate) || recoveryRate < 0 || recoveryRate > 1) throw new Error('Recovery rate must be between 0 and 1.');
  const atRisk = Math.max(0, -candidate.revenue_change);
  return { customer: candidate.customer, revenue_at_risk: atRisk, recovery_rate: recoveryRate, estimated_recovered_revenue: atRisk * recoveryRate, assumptions: ['Scenario is arithmetic, not a forecast.', 'Recovery rate is a management assumption.', 'No margin, cash collection, or customer-response probability is implied.'] };
}

export function recommendedActionsForOpportunities(rows: CustomerOpportunity[]) {
  return rows.slice(0, 3).map((row, index) => ({ priority: index + 1, action: `Prepare a salesperson follow-up for ${row.customer}.`, evidence: row.rationale, expected_impact: `At-risk comparable revenue: ${row.revenue_change < 0 ? -row.revenue_change : 0}.`, effort: 'low', guardrail: 'Prepare a follow-up only; do not contact the customer or change commercial terms automatically.', KPI: 'Recovered issued-invoice revenue in the next comparable period.' }));
}
