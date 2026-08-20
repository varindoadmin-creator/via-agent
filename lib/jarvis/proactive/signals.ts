export interface ExecutiveSignalInput {
  revenueGrowth?: number | null;
  grossMargin?: number | null;
  previousGrossMargin?: number | null;
  overdueShare?: number | null;
  topCustomerShare?: number | null;
  inventoryAlertCount?: number | null;
  automationFailureCount?: number | null;
}

export interface ExecutiveSignal {
  code: string;
  severity: 'info' | 'warning' | 'critical';
  evidence: string;
  recommended_review: string;
}

/** Pure hook for a future approved scheduler. It performs no background work or writes. */
export function evaluateExecutiveSignals(input: ExecutiveSignalInput): ExecutiveSignal[] {
  const signals: ExecutiveSignal[] = [];
  if (input.revenueGrowth != null && input.revenueGrowth <= -0.1) signals.push({ code: 'sales_decline', severity: 'warning', evidence: `Revenue declined ${(Math.abs(input.revenueGrowth) * 100).toFixed(1)}%.`, recommended_review: 'Review customer and product contribution to the decline.' });
  if (input.grossMargin != null && input.previousGrossMargin != null && input.previousGrossMargin - input.grossMargin >= 0.02) signals.push({ code: 'margin_deterioration', severity: 'warning', evidence: `Gross margin declined ${((input.previousGrossMargin - input.grossMargin) * 100).toFixed(1)} percentage points.`, recommended_review: 'Review discounting, cost changes, and product mix.' });
  if (input.overdueShare != null && input.overdueShare >= 0.4) signals.push({ code: 'receivables_risk', severity: 'critical', evidence: `${(input.overdueShare * 100).toFixed(1)}% of outstanding receivables are overdue.`, recommended_review: 'Prioritize the largest overdue customer balances.' });
  if (input.topCustomerShare != null && input.topCustomerShare >= 0.3) signals.push({ code: 'customer_concentration', severity: 'warning', evidence: `The largest customer represents ${(input.topCustomerShare * 100).toFixed(1)}% of revenue.`, recommended_review: 'Review concentration resilience and account diversification.' });
  if ((input.inventoryAlertCount || 0) > 0) signals.push({ code: 'inventory_exceptions', severity: 'warning', evidence: `${input.inventoryAlertCount} inventory exceptions require review.`, recommended_review: 'Prioritize stockout and negative-stock exceptions before slow-moving stock.' });
  if ((input.automationFailureCount || 0) > 0) signals.push({ code: 'automation_health', severity: 'critical', evidence: `${input.automationFailureCount} automation jobs failed or missed heartbeat.`, recommended_review: 'Restore automation health before relying on downstream operational data.' });
  return signals;
}
