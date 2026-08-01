export type RiskInput = {
  overdueInvoiceCount: number;
  issuedInvoiceCount: number;
  averagePaymentDelayDays: number | null;
  outstandingBalance: number;
  creditLimit: number | null;
  recentRevenue: number;
  previousRevenue: number;
  disputedOrCancelledCount: number;
};

export type RiskFactor = { key: string; label: string; points: number; detail: string };

export function calculateCustomerRisk(input: RiskInput) {
  const factors: RiskFactor[] = [];
  const overdueRate = input.issuedInvoiceCount > 0 ? input.overdueInvoiceCount / input.issuedInvoiceCount : 0;
  const overduePoints = Math.min(25, Math.round(overdueRate * 20 + Math.min(input.overdueInvoiceCount, 5)));
  if (overduePoints > 0) factors.push({ key: 'overdue', label: 'Overdue frequency', points: overduePoints, detail: `${input.overdueInvoiceCount} overdue of ${input.issuedInvoiceCount} issued invoices` });

  const delayPoints = input.averagePaymentDelayDays == null ? 0 : Math.min(20, Math.round(input.averagePaymentDelayDays / 3));
  if (delayPoints > 0) factors.push({ key: 'delay', label: 'Payment delay', points: delayPoints, detail: `${Math.round(input.averagePaymentDelayDays!)} average days late` });

  const outstandingPoints = input.outstandingBalance <= 0 ? 0 : Math.min(15, Math.max(2, Math.round(input.outstandingBalance / 10_000_000)));
  if (outstandingPoints > 0) factors.push({ key: 'outstanding', label: 'Outstanding balance', points: outstandingPoints, detail: `${input.outstandingBalance} outstanding` });

  const creditUtilization = input.creditLimit && input.creditLimit > 0 ? input.outstandingBalance / input.creditLimit : null;
  const utilizationPoints = creditUtilization == null || creditUtilization <= 0.5 ? 0 : Math.min(20, Math.round((creditUtilization - 0.5) * 30));
  if (utilizationPoints > 0) factors.push({ key: 'credit', label: 'Credit utilization', points: utilizationPoints, detail: `${Math.round(creditUtilization! * 100)}% of credit limit used` });

  const growthPercent = input.previousRevenue > 0 ? ((input.recentRevenue - input.previousRevenue) / input.previousRevenue) * 100 : null;
  const growthPoints = growthPercent != null && growthPercent < 0 ? Math.min(10, Math.round(Math.abs(growthPercent) / 10)) : 0;
  if (growthPoints > 0) factors.push({ key: 'growth', label: 'Order decline', points: growthPoints, detail: `${Math.round(Math.abs(growthPercent!))}% decline versus previous 90 days` });

  const exceptionPoints = Math.min(10, input.disputedOrCancelledCount * 5);
  if (exceptionPoints > 0) factors.push({ key: 'exceptions', label: 'Disputed/cancelled', points: exceptionPoints, detail: `${input.disputedOrCancelledCount} disputed, void, or cancelled transactions` });

  const score = Math.min(100, factors.reduce((sum, factor) => sum + factor.points, 0));
  const level = score >= 75 ? 'critical' : score >= 50 ? 'high' : score >= 25 ? 'watch' : 'low';
  return { score, level, factors, overdueRate, creditUtilization, growthPercent };
}
