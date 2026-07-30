import { NextRequest, NextResponse } from 'next/server';
import { aiCompletion, getAIProviderName } from '@/lib/ai/provider';
import { getZohoAccessToken, getZohoApiBaseUrl, getZohoOrgId } from '@/lib/zoho/auth';
import { fetchWithRetry } from '@/lib/zoho/retry';

export const maxDuration = 300;

type SalesRow = Record<string, unknown>;

interface MonthResult {
  key: string;
  label: string;
  from: string;
  to: string;
  revenue: number;
  growth: number | null;
  salesperson_count: number;
  top_salespeople: Array<{ name: string; revenue: number; share: number }>;
  partial: boolean;
}

function money(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function ymd(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function jakartaNow(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
}

function monthBounds(offset: number, currentDay?: number) {
  const now = jakartaNow();
  const date = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const year = date.getFullYear();
  const month = date.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const isCurrent = offset === 0;
  const day = currentDay
    ? Math.min(currentDay, lastDay)
    : isCurrent
      ? now.getDate()
      : lastDay;
  return {
    key: `${year}-${String(month + 1).padStart(2, '0')}`,
    label: date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
    from: ymd(year, month, 1),
    to: ymd(year, month, day),
    partial: isCurrent,
  };
}

async function zohoGet(path: string) {
  const token = await getZohoAccessToken();
  const base = getZohoApiBaseUrl();
  const orgId = getZohoOrgId();
  const separator = path.includes('?') ? '&' : '?';
  const response = await fetchWithRetry(
    `${base}${path}${separator}organization_id=${orgId}`,
    { headers: { Authorization: `Zoho-oauthtoken ${token}` } },
    { retries: 3, baseDelayMs: 2_000 },
  );
  const data = await response.json();
  if (!response.ok) throw new Error(`Zoho ${response.status}: ${JSON.stringify(data)}`);
  return data;
}

async function getMonthSales(offset: number, currentDay?: number): Promise<MonthResult> {
  const bounds = monthBounds(offset, currentDay);
  const data = await zohoGet(
    `/reports/salesbysalesperson?from_date=${bounds.from}&to_date=${bounds.to}&per_page=200`,
  );
  const rows = (data.sales || []) as SalesRow[];
  const contributors = rows
    .map(row => ({
      name: String(
        row.salesperson_name ||
        row.sales_person_name ||
        row.name ||
        'Unassigned',
      ),
      revenue: money(row.invoice_sales ?? row.sales ?? row.amount ?? 0),
    }))
    .filter(row => row.revenue !== 0)
    .sort((a, b) => b.revenue - a.revenue);
  const revenue = contributors.reduce((sum, row) => sum + row.revenue, 0);

  return {
    ...bounds,
    revenue,
    growth: null,
    salesperson_count: contributors.length,
    top_salespeople: contributors.slice(0, 5).map(row => ({
      ...row,
      share: revenue > 0 ? row.revenue / revenue : 0,
    })),
  };
}

function deterministicInsights(
  months: MonthResult[],
  currentComparable: { current: number; previous: number; growth: number | null },
) {
  const completed = months.filter(month => !month.partial);
  const latest = completed.at(-1);
  const previous = completed.at(-2);
  const positiveMonths = completed.filter(month => (month.growth || 0) > 0).length;
  const best = [...completed].sort((a, b) => b.revenue - a.revenue)[0];
  const top = months.at(-1)?.top_salespeople[0];

  const observations = [
    latest && previous
      ? `${latest.label} sales were ${latest.growth !== null ? `${Math.abs(latest.growth * 100).toFixed(1)}% ${latest.growth >= 0 ? 'higher' : 'lower'}` : 'not comparable'} than ${previous.label}.`
      : 'More completed-month history is needed for a reliable trend.',
    `${positiveMonths} of the last ${completed.length} completed months grew versus the previous month.`,
    best ? `${best.label} was the strongest completed month at Rp ${Math.round(best.revenue).toLocaleString('id-ID')}.` : '',
    top ? `${top.name} currently contributes ${(top.share * 100).toFixed(1)}% of sales, indicating ${top.share > 0.4 ? 'high concentration risk' : 'a reasonably distributed sales mix'}.` : '',
  ].filter(Boolean);

  const actions = [
    currentComparable.growth !== null && currentComparable.growth < 0
      ? 'Recover the current month gap by assigning weekly targets equal to the shortfall and reviewing pipeline conversion every Monday.'
      : 'Protect current momentum by converting the strongest active opportunities before month-end.',
    best ? `Review the customer and product mix from ${best.label}, then repeat the offers and account activity that produced that peak.` : 'Build a repeatable monthly account plan around the strongest products and customers.',
    top?.share && top.share > 0.4
      ? 'Reduce concentration risk by transferring the top salesperson’s winning account approach to the rest of the team.'
      : 'Set salesperson-level growth targets and track contribution weekly.',
  ];

  return {
    headline: currentComparable.growth !== null
      ? `Current month pace is ${currentComparable.growth >= 0 ? 'ahead of' : 'behind'} the same period last month by ${Math.abs(currentComparable.growth * 100).toFixed(1)}%.`
      : 'Current month growth cannot yet be compared.',
    observations,
    actions,
    risks: ['Current-month figures are month-to-date and can change before closing.', 'Zoho invoice timing can create month-end volatility.'],
  };
}

function extractJson(content: string) {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced || content.slice(content.indexOf('{'), content.lastIndexOf('}') + 1);
  return JSON.parse(candidate);
}

export async function GET(request: NextRequest) {
  try {
    const requestedMonths = Number(request.nextUrl.searchParams.get('months') || 12);
    const count = [6, 12, 24].includes(requestedMonths) ? requestedMonths : 12;
    const offsets = Array.from({ length: count }, (_, index) => index - count + 1);
    const months: MonthResult[] = [];

    for (let index = 0; index < offsets.length; index += 3) {
      const batch = await Promise.all(offsets.slice(index, index + 3).map(offset => getMonthSales(offset)));
      months.push(...batch);
    }

    for (let index = 0; index < months.length; index++) {
      const previous = months[index - 1]?.revenue;
      months[index].growth = index > 0 && previous !== 0
        ? (months[index].revenue - previous) / previous
        : null;
    }

    const now = jakartaNow();
    const previousComparable = await getMonthSales(-1, now.getDate());
    const currentRevenue = months.at(-1)?.revenue || 0;
    const comparableGrowth = previousComparable.revenue > 0
      ? (currentRevenue - previousComparable.revenue) / previousComparable.revenue
      : null;
    if (months.length > 0) months[months.length - 1].growth = comparableGrowth;
    const currentComparable = {
      current: currentRevenue,
      previous: previousComparable.revenue,
      growth: comparableGrowth,
      through_day: now.getDate(),
    };

    const fallback = deterministicInsights(months, currentComparable);
    let insights = fallback;
    let ai = { generated: false, provider: getAIProviderName(), model: null as string | null };

    try {
      const result = await aiCompletion([
        {
          role: 'user',
          content: JSON.stringify({
            monthly_sales: months.map(month => ({
              month: month.label,
              revenue_before_ppn: Math.round(month.revenue),
              growth_percent: month.growth === null ? null : Number((month.growth * 100).toFixed(2)),
              partial_month: month.partial,
            })),
            current_month_same_period_comparison: {
              through_day: currentComparable.through_day,
              current_revenue: Math.round(currentComparable.current),
              previous_month_same_days_revenue: Math.round(currentComparable.previous),
              growth_percent: comparableGrowth === null ? null : Number((comparableGrowth * 100).toFixed(2)),
            },
            current_top_salespeople: months.at(-1)?.top_salespeople || [],
          }),
        },
      ], {
        system: `You are VIA's senior business analyst. Analyze only the supplied Zoho Books sales data. Revenue is before PPN and all invoices are included. Return strict JSON with this shape: {"headline":"one sentence","observations":["3-5 evidence-based findings"],"actions":["3-5 specific actions to grow next month"],"risks":["1-3 caveats"]}. Distinguish partial current-month data from completed months. Quote numeric percentages or rupiah amounts when useful. Never invent customers, products, causes, or facts that are not in the data.`,
        temperature: 0.2,
        maxTokens: 1400,
      });
      const parsed = extractJson(result.content);
      if (parsed?.headline && Array.isArray(parsed.observations) && Array.isArray(parsed.actions)) {
        insights = {
          headline: String(parsed.headline),
          observations: parsed.observations.map(String),
          actions: parsed.actions.map(String),
          risks: Array.isArray(parsed.risks) ? parsed.risks.map(String) : fallback.risks,
        };
        ai = { generated: true, provider: getAIProviderName(), model: result.model };
      }
    } catch (error) {
      console.warn('[Business Analytics] AI insight generation failed; using deterministic analysis:', error);
    }

    const completed = months.filter(month => !month.partial);
    const averageRevenue = completed.length
      ? completed.reduce((sum, month) => sum + month.revenue, 0) / completed.length
      : 0;
    const bestMonth = [...completed].sort((a, b) => b.revenue - a.revenue)[0] || null;

    return NextResponse.json({
      success: true,
      months,
      current_comparable: currentComparable,
      summary: {
        average_completed_month_revenue: averageRevenue,
        best_month: bestMonth,
        positive_growth_months: completed.filter(month => (month.growth || 0) > 0).length,
        completed_months: completed.length,
      },
      insights,
      ai,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
