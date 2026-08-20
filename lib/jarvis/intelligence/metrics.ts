export interface NamedValue { name: string; value: number }

export function calculateGrowth(current: number, previous: number): number | null {
  const base = Number(previous) || 0;
  return base === 0 ? null : ((Number(current) || 0) - base) / base;
}

export function calculateAverageOrderValue(revenue: number, orderCount: number): number {
  return orderCount > 0 ? (Number(revenue) || 0) / orderCount : 0;
}

export function calculateConcentration(rows: NamedValue[], topCount = 5) {
  const total = rows.reduce((sum, row) => sum + Math.max(0, row.value), 0);
  const sorted = [...rows].sort((a, b) => b.value - a.value);
  const top = sorted.slice(0, topCount).map(row => ({
    ...row,
    share: total > 0 ? row.value / total : 0,
  }));
  return { total, top, top_share: top.reduce((sum, row) => sum + row.share, 0) };
}

export function calculateGrossMargin(revenue: number, cost: number) {
  const grossProfit = (Number(revenue) || 0) - (Number(cost) || 0);
  return { gross_profit: grossProfit, gross_margin: revenue > 0 ? grossProfit / revenue : null };
}
