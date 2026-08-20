export interface ReceivableInput {
  balance: number;
  dueDate: string;
  customerName: string;
}

export function summarizeReceivables(rows: ReceivableInput[], asOf: string) {
  const asOfMs = Date.parse(`${asOf}T00:00:00Z`);
  if (!Number.isFinite(asOfMs)) throw new Error('Invalid receivables as-of date.');
  const buckets = { current: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, over_90: 0, unknown_due_date: 0 };
  const customers = new Map<string, number>();
  let total = 0, overdue = 0;
  for (const row of rows) {
    const balance = Math.max(0, Number(row.balance) || 0);
    if (!balance) continue;
    total += balance;
    customers.set(row.customerName || 'Unassigned', (customers.get(row.customerName || 'Unassigned') || 0) + balance);
    const dueMs = Date.parse(`${row.dueDate}T00:00:00Z`);
    if (!Number.isFinite(dueMs)) { buckets.unknown_due_date += balance; continue; }
    const days = Math.floor((asOfMs - dueMs) / 86_400_000);
    if (days <= 0) buckets.current += balance;
    else {
      overdue += balance;
      if (days <= 30) buckets.days_1_30 += balance;
      else if (days <= 60) buckets.days_31_60 += balance;
      else if (days <= 90) buckets.days_61_90 += balance;
      else buckets.over_90 += balance;
    }
  }
  const topCustomers = [...customers].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, balance]) => ({ name, balance, share: total > 0 ? balance / total : 0 }));
  return { total_outstanding: total, overdue_outstanding: overdue, overdue_share: total > 0 ? overdue / total : 0, buckets, top_customers: topCustomers };
}
