'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

interface MonthData {
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

interface AnalyticsData {
  months: MonthData[];
  current_comparable: {
    current: number;
    previous: number;
    growth: number | null;
    through_day: number;
  };
  summary: {
    average_completed_month_revenue: number;
    best_month: MonthData | null;
    positive_growth_months: number;
    completed_months: number;
  };
  insights: {
    headline: string;
    observations: string[];
    actions: string[];
    risks: string[];
  };
  ai: { generated: boolean; provider: string; model: string | null };
  generated_at: string;
}

const mono = { fontFamily: 'JetBrains Mono, monospace' };
const formatRp = (value: number) => `Rp ${Math.round(value || 0).toLocaleString('id-ID')}`;
const formatPct = (value: number | null) => value === null ? '—' : `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`;

function MetricCard({ label, value, note, tone }: { label: string; value: string; note: string; tone?: 'good' | 'bad' | 'accent' }) {
  const color = tone === 'good' ? 'var(--success)' : tone === 'bad' ? 'var(--danger)' : tone === 'accent' ? 'var(--accent)' : 'var(--text)';
  return (
    <div className="via-card p-4">
      <div className="text-[var(--text-4)] text-[10px] uppercase tracking-wider mb-2">{label}</div>
      <div className="font-bold text-lg" style={{ ...mono, color }}>{value}</div>
      <div className="text-[var(--text-4)] text-xs mt-2">{note}</div>
    </div>
  );
}

export default function BusinessAnalyticsPage() {
  const [range, setRange] = useState<6 | 12 | 24>(12);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/reports/business-analytics?months=${range}`, { cache: 'no-store' });
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) throw new Error(`Unexpected server response (${response.status})`);
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Could not load business analytics');
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { load(); }, [load]);

  const maxRevenue = useMemo(
    () => Math.max(...(data?.months.map(month => month.revenue) || [1]), 1),
    [data],
  );

  const current = data?.months.at(-1);
  const currentGrowth = data?.current_comparable.growth ?? null;

  return (
    <div className="via-page" style={{ minHeight: '100%', background: 'var(--bg)' }}>
      <div style={{ maxWidth: 1440, margin: '0 auto' }}>
        <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
          <div>
            <h1 className="text-[var(--text)] font-semibold text-2xl tracking-tight">Business Analytics</h1>
            <p className="text-[var(--text-4)] text-xs mt-1">Month-over-month sales growth and evidence-based actions from Zoho Books · Revenue before PPN · All invoices</p>
          </div>
          <div className="flex items-center gap-2">
            {[6, 12, 24].map(months => (
              <button
                key={months}
                onClick={() => setRange(months as 6 | 12 | 24)}
                className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${range === months ? 'bg-[var(--accent)] text-white border-transparent' : 'bg-[var(--surface-1)] text-[var(--text-3)] border-[var(--border)]'}`}
              >
                {months} months
              </button>
            ))}
            <button onClick={load} disabled={loading} className="px-3 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-3)] disabled:opacity-50">
              {loading ? 'Analyzing…' : 'Refresh'}
            </button>
          </div>
        </div>

        {error && (
          <div className="p-4 mb-5 bg-[var(--danger-bg)] border border-[var(--danger-border)] rounded-lg text-[var(--danger)] text-sm">
            {error}
          </div>
        )}

        {loading && !data && (
          <div className="via-card p-12 text-center text-[var(--text-4)] text-sm">Loading Zoho sales history and preparing business analysis…</div>
        )}

        {data && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
              <MetricCard
                label="Current Month Sales"
                value={formatRp(data.current_comparable.current)}
                note={`Through day ${data.current_comparable.through_day}`}
                tone="accent"
              />
              <MetricCard
                label="Growth vs Same Period"
                value={formatPct(currentGrowth)}
                note={`${formatRp(data.current_comparable.previous)} in the same days last month`}
                tone={currentGrowth !== null && currentGrowth >= 0 ? 'good' : 'bad'}
              />
              <MetricCard
                label="Average Completed Month"
                value={formatRp(data.summary.average_completed_month_revenue)}
                note={`${data.summary.completed_months} completed months analyzed`}
              />
              <MetricCard
                label="Best Completed Month"
                value={data.summary.best_month?.label || '—'}
                note={data.summary.best_month ? formatRp(data.summary.best_month.revenue) : 'No completed month'}
                tone="good"
              />
            </div>

            <div className="via-card p-5 mb-5">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-[var(--text)] text-sm font-semibold">Monthly Sales Trend</h2>
                  <div className="text-[var(--text-4)] text-xs mt-1">Current month is month-to-date and compared with the same number of days last month.</div>
                </div>
                <div className="text-[var(--text-4)] text-xs">{data.summary.positive_growth_months} growth months</div>
              </div>
              <div className="flex items-end gap-2 overflow-x-auto pb-2" style={{ minHeight: 245 }}>
                {data.months.map(month => {
                  const height = Math.max(8, (month.revenue / maxRevenue) * 175);
                  return (
                    <div key={month.key} className="flex-1 min-w-[64px] flex flex-col items-center justify-end" style={{ height: 220 }}>
                      <div className={`text-[10px] mb-2 ${month.growth === null ? 'text-[var(--text-4)]' : month.growth >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`} style={mono}>
                        {formatPct(month.growth)}
                      </div>
                      <div title={`${month.label}: ${formatRp(month.revenue)}`} className="w-full max-w-[52px] rounded-t-md" style={{ height, background: month.partial ? 'var(--accent)' : 'var(--info)', opacity: month.partial ? 1 : 0.72 }} />
                      <div className="text-[var(--text-3)] text-[10px] mt-2 text-center whitespace-nowrap">{month.label.replace(' ', ' ’')}</div>
                      {month.partial && <div className="text-[var(--accent-text)] text-[9px] mt-1">MTD</div>}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-5 gap-5 mb-5">
              <div className="via-card overflow-hidden xl:col-span-3">
                <div className="px-4 py-3 border-b border-[var(--border)]">
                  <h2 className="text-[var(--text)] text-sm font-semibold">Month-by-Month Performance</h2>
                </div>
                <div className="overflow-x-auto">
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {['Month', 'Sales Before PPN', 'Growth', 'Top Salesperson', 'Share'].map(label => (
                          <th key={label} className="text-[var(--text-4)] text-[10px] uppercase tracking-wider" style={{ padding: '9px 12px', textAlign: label === 'Month' || label === 'Top Salesperson' ? 'left' : 'right', borderBottom: '1px solid var(--border)' }}>{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...data.months].reverse().map(month => (
                        <tr key={month.key} style={{ borderBottom: '1px solid var(--border-muted)' }}>
                          <td className="text-[var(--text)] text-xs" style={{ padding: '9px 12px' }}>{month.label}{month.partial ? ' (MTD)' : ''}</td>
                          <td className="text-[var(--text)] text-xs" style={{ padding: '9px 12px', textAlign: 'right', ...mono }}>{formatRp(month.revenue)}</td>
                          <td className={`text-xs ${month.growth === null ? 'text-[var(--text-4)]' : month.growth >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`} style={{ padding: '9px 12px', textAlign: 'right', ...mono }}>{formatPct(month.growth)}</td>
                          <td className="text-[var(--text-3)] text-xs" style={{ padding: '9px 12px' }}>{month.top_salespeople[0]?.name || '—'}</td>
                          <td className="text-[var(--text-3)] text-xs" style={{ padding: '9px 12px', textAlign: 'right', ...mono }}>{month.top_salespeople[0] ? `${(month.top_salespeople[0].share * 100).toFixed(1)}%` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="via-card p-5 xl:col-span-2">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-[var(--text)] text-sm font-semibold">VIA Business Analyst</h2>
                  <span className="text-[var(--text-4)] text-[10px]">{data.ai.generated ? `${data.ai.provider} · ${data.ai.model}` : 'Rules-based fallback'}</span>
                </div>
                <div className="text-[var(--accent-text)] text-sm font-semibold leading-relaxed p-3 rounded-lg bg-[var(--accent-muted)] mb-4">{data.insights.headline}</div>

                <div className="text-[var(--text-4)] text-[10px] uppercase tracking-wider mb-2">What the data says</div>
                <ul className="space-y-2 mb-5">
                  {data.insights.observations.map((item, index) => <li key={index} className="text-[var(--text-2)] text-xs leading-relaxed">• {item}</li>)}
                </ul>

                <div className="text-[var(--text-4)] text-[10px] uppercase tracking-wider mb-2">Actions to grow next month</div>
                <ol className="space-y-2 mb-5">
                  {data.insights.actions.map((item, index) => (
                    <li key={index} className="flex gap-2 text-[var(--text)] text-xs leading-relaxed">
                      <span className="text-[var(--accent)] font-bold" style={mono}>{index + 1}.</span><span>{item}</span>
                    </li>
                  ))}
                </ol>

                <div className="text-[var(--text-4)] text-[10px] uppercase tracking-wider mb-2">Caveats</div>
                {data.insights.risks.map((item, index) => <div key={index} className="text-[var(--text-4)] text-[11px] leading-relaxed mb-1">• {item}</div>)}
              </div>
            </div>

            {current?.top_salespeople?.length > 0 && (
              <div className="via-card p-5">
                <h2 className="text-[var(--text)] text-sm font-semibold mb-4">Current Month Sales Contributors</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
                  {current.top_salespeople.map((person, index) => (
                    <div key={person.name} className="p-3 rounded-lg bg-[var(--surface-2)] border border-[var(--border)]">
                      <div className="text-[var(--text-4)] text-[10px]">#{index + 1}</div>
                      <div className="text-[var(--text)] text-xs font-semibold mt-1 truncate">{person.name}</div>
                      <div className="text-[var(--accent-text)] text-xs mt-2" style={mono}>{formatRp(person.revenue)}</div>
                      <div className="text-[var(--text-4)] text-[10px] mt-1">{(person.share * 100).toFixed(1)}% share</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
