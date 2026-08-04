'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type GroupKey = 'brand' | 'hub' | 'customer';
type GroupRow = { name: string; revenue: number; cost: number; gross_profit: number; gp_margin: number; quantity: number; invoice_count: number; invoices: Array<{ invoice_id: string; invoice_number: string }>; missing_cost_lines: number };
type Report = {
  month: string; from: string; to: string; basis: string; generated_at: string;
  summary: { revenue: number; cost: number; gross_profit: number; gp_margin: number; quantity: number; invoice_count: number; missing_cost_lines: number };
  groups: Record<GroupKey, GroupRow[]>;
};

const mono = { fontFamily: 'JetBrains Mono, monospace' };
const rp = (value: number) => `Rp ${Math.round(value || 0).toLocaleString('id-ID')}`;
const pct = (value: number) => `${((value || 0) * 100).toFixed(1)}%`;
const currentMonth = () => {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};
const chartColors = ['#0073ea', '#00c875', '#fdab3d', '#e2445c', '#a25ddc', '#579bfc', '#ff7575', '#66ccff', '#cab641', '#7f5347', '#9cd326', '#784bd1'];

function GrossProfitDonut({ rows }: { rows: GroupRow[] }) {
  const positive = rows.filter(row => row.gross_profit > 0);
  const total = positive.reduce((sum, row) => sum + row.gross_profit, 0);
  let cursor = 0;
  const stops = positive.map((row, index) => {
    const start = cursor; cursor += total > 0 ? row.gross_profit / total * 100 : 0;
    return `${chartColors[index % chartColors.length]} ${start}% ${cursor}%`;
  });
  return (
    <div className="via-card p-5 mb-5">
      <div className="flex flex-wrap items-center gap-8">
        <div className="relative shrink-0" style={{ width: 220, height: 220, borderRadius: '50%', background: total > 0 ? `conic-gradient(${stops.join(',')})` : 'var(--surface-3)' }}>
          <div className="absolute flex flex-col items-center justify-center rounded-full bg-[var(--surface)]" style={{ inset: 45 }}><span className="text-[var(--text-4)] text-[10px] uppercase">Total GP</span><span className="text-[var(--text)] text-xs font-semibold mt-1" style={mono}>{rp(total)}</span></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-8 gap-y-3 flex-1">
          {positive.map((row, index) => <div key={row.name} className="flex items-center gap-2 min-w-0"><span className="w-3 h-3 rounded-sm shrink-0" style={{ background: chartColors[index % chartColors.length] }}/><div className="min-w-0"><div className="text-[var(--text)] text-xs font-semibold truncate">{row.name}</div><div className="text-[var(--text-4)] text-[10px]" style={mono}>{total > 0 ? `${(row.gross_profit / total * 100).toFixed(1)}%` : '0.0%'} · {rp(row.gross_profit)}</div></div></div>)}
        </div>
      </div>
      {rows.some(row => row.gross_profit < 0) && <div className="text-[var(--warning)] text-xs mt-3">Brands with negative GP are shown in the table but excluded from the 100% positive-GP circle.</div>}
    </div>
  );
}

export default function GrossProfitPage() {
  const [month, setMonth] = useState(currentMonth);
  const [group, setGroup] = useState<GroupKey>('brand');
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch(`/api/reports/gross-profit?month=${month}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Unable to load GP report');
      setReport(data);
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setLoading(false); }
  }, [month]);
  useEffect(() => { load(); }, [load]);
  const rows = useMemo(() => (report?.groups[group] || []).filter(row => row.name.toLowerCase().includes(search.toLowerCase())), [report, group, search]);

  return (
    <div className="via-page" style={{ minHeight: '100%', background: 'var(--bg)' }}><div style={{ maxWidth: 1440, margin: '0 auto' }}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div><h1 className="text-[var(--text)] font-semibold text-2xl tracking-tight">Monthly Gross Profit</h1><p className="text-[var(--text-4)] text-xs mt-1">GP by Brand, Hub, and Customer · Revenue before PPN · All issued invoices</p></div>
        <div className="flex gap-2"><input type="month" value={month} onChange={event => setMonth(event.target.value)} className="via-input px-3 py-1.5 text-xs"/><button onClick={load} disabled={loading} className="px-3 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-3)] disabled:opacity-50">{loading ? 'Calculating…' : 'Refresh'}</button></div>
      </div>
      {error && <div className="p-4 mb-5 bg-[var(--danger-bg)] border border-[var(--danger-border)] rounded-lg text-[var(--danger)] text-sm">{error}</div>}
      {loading && !report && <div className="via-card p-12 text-center text-[var(--text-4)] text-sm">Loading invoice details and purchase costs from Zoho…</div>}
      {report && <>
        <div className="grid grid-cols-2 xl:grid-cols-6 gap-3 mb-5">{[
          ['Revenue', rp(report.summary.revenue)], ['Cost', rp(report.summary.cost)], ['Gross Profit', rp(report.summary.gross_profit)], ['GP Margin', pct(report.summary.gp_margin)], ['Invoices', String(report.summary.invoice_count)], ['Missing Costs', String(report.summary.missing_cost_lines)],
        ].map(([label, value]) => <div key={label} className="via-card p-4"><div className="text-[var(--text-4)] text-[10px] uppercase tracking-wider">{label}</div><div className="text-[var(--text)] font-semibold mt-2 text-sm" style={mono}>{value}</div></div>)}</div>
        {group === 'brand' && <GrossProfitDonut rows={report.groups.brand}/>}
        <div className="via-card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-[var(--border)]">
            <div className="flex gap-2">{(['brand','hub','customer'] as GroupKey[]).map(key => <button key={key} onClick={() => setGroup(key)} className={`px-3 py-1.5 text-xs rounded-lg border ${group === key ? 'bg-[var(--accent)] text-white border-transparent' : 'border-[var(--border)] text-[var(--text-3)]'}`}>{key === 'brand' ? 'By Brand' : key === 'hub' ? 'By Hub' : 'By Customer'}</button>)}</div>
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder={`Search ${group}…`} className="via-input px-3 py-1.5 text-xs w-64"/>
          </div>
          <div className="overflow-x-auto"><table className="w-full text-xs"><thead className="bg-[var(--surface-2)]"><tr>{['Name','Revenue','Cost','Gross Profit','GP Share','GP Margin','Qty','Invoices','Missing Costs'].map(label => <th key={label} className="px-3 py-2 text-[10px] uppercase tracking-wider text-[var(--text-3)] border-b border-[var(--border)]" style={{ textAlign: label === 'Name' ? 'left' : 'right' }}>{label}</th>)}</tr></thead><tbody>
            {rows.map(row => <tr key={row.name} className="border-b border-[var(--border-muted)]"><td className="px-3 py-2 font-semibold text-[var(--text)]">{row.name}</td><td className="px-3 py-2 text-right" style={mono}>{rp(row.revenue)}</td><td className="px-3 py-2 text-right" style={mono}>{rp(row.cost)}</td><td className={`px-3 py-2 text-right ${row.gross_profit >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`} style={mono}>{rp(row.gross_profit)}</td><td className="px-3 py-2 text-right font-semibold text-[var(--accent-text)]" style={mono}>{report.summary.gross_profit ? pct(row.gross_profit / report.summary.gross_profit) : '—'}</td><td className="px-3 py-2 text-right" style={mono}>{pct(row.gp_margin)}</td><td className="px-3 py-2 text-right" style={mono}>{row.quantity.toLocaleString('id-ID')}</td><td className="px-3 py-2 text-right"><details className="inline-block text-left"><summary className="cursor-pointer text-[var(--accent-text)]" style={mono}>{row.invoice_count}</summary><div className="mt-1 min-w-32 rounded border border-[var(--border)] bg-[var(--surface)] p-2 shadow-lg">{row.invoices.map(invoice => <div key={invoice.invoice_id} className="text-[var(--text-3)] py-0.5 whitespace-nowrap" style={mono}>{invoice.invoice_number}</div>)}</div></details></td><td className={`px-3 py-2 text-right ${row.missing_cost_lines ? 'text-[var(--warning)]' : 'text-[var(--text-4)]'}`} style={mono}>{row.missing_cost_lines}</td></tr>)}
            {!loading && rows.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-[var(--text-4)]">No records for this selection.</td></tr>}
          </tbody></table></div>
          <div className="px-4 py-3 text-[var(--text-4)] text-xs bg-[var(--surface-2)] border-t border-[var(--border)]">{report.basis}</div>
        </div>
      </>}
    </div></div>
  );
}
