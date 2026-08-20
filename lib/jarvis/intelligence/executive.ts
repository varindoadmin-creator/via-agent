import { calculateGrowth } from './metrics.ts';

export interface ExecutiveSalesPeriod {
  label: string;
  revenue: number;
  invoiceCount: number;
  averageInvoiceValue: number;
  topCustomerName?: string;
  topCustomerShare?: number;
  topSalespersonName?: string;
  topSalespersonShare?: number;
}

export function buildExecutiveSalesAssessment(current: ExecutiveSalesPeriod, comparison?: ExecutiveSalesPeriod) {
  const growth = comparison ? calculateGrowth(current.revenue, comparison.revenue) : null;
  const facts = [
    `${current.label} revenue before PPN is Rp ${Math.round(current.revenue).toLocaleString('id-ID')} from ${current.invoiceCount} issued invoices.`,
    `Average invoice value is Rp ${Math.round(current.averageInvoiceValue).toLocaleString('id-ID')}.`,
  ];
  if (comparison && growth !== null) facts.push(`Revenue is ${(Math.abs(growth) * 100).toFixed(1)}% ${growth >= 0 ? 'above' : 'below'} ${comparison.label}.`);
  if (current.topCustomerName && current.topCustomerShare !== undefined) facts.push(`${current.topCustomerName} contributes ${(current.topCustomerShare * 100).toFixed(1)}% of period revenue.`);

  const concerns: string[] = [];
  const opportunities: string[] = [];
  if (growth !== null && growth < 0) concerns.push('Revenue is below the comparison period; identify the customer and salesperson contributions to the gap before assigning a cause.');
  if ((current.topCustomerShare || 0) >= 0.3) concerns.push('Customer concentration is elevated, increasing dependency on one account.');
  if ((current.topSalespersonShare || 0) >= 0.4) concerns.push('Salesperson concentration is elevated; performance may not be broadly distributed across the team.');
  if (growth !== null && growth > 0) opportunities.push('Protect the current growth by identifying which customer gains are repeatable next period.');
  if ((current.topCustomerShare || 0) < 0.3) opportunities.push('Revenue is not dominated by one customer; use the broader account base for structured cross-selling.');

  const actions = [
    { priority: 1, action: growth !== null && growth < 0 ? 'Review the largest customer-level revenue declines versus the comparison period.' : 'Identify the customers responsible for the largest period growth and validate repeatability.', kpi: 'Revenue growth by customer' },
    { priority: 2, action: 'Review top-customer and top-salesperson contribution weekly.', kpi: 'Top-1 and top-5 revenue concentration' },
    { priority: 3, action: 'Track invoice count and average invoice value separately to distinguish volume from order-size changes.', kpi: 'Invoice count and average invoice value' },
  ];
  return { growth, facts, concerns, opportunities, actions, confidence: comparison ? 'high' : 'moderate' as const };
}
