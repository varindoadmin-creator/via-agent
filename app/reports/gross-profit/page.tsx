'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type GroupKey = 'brand' | 'hub' | 'customer';
type GroupRow = { name: string; revenue: number; cost: number; gross_profit: number; gp_margin: number; quantity: number; invoice_count: number; missing_cost_lines: number };
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
        <div className="via-card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-[var(--border)]">
            <div className="flex gap-2">{(['brand','hub','customer'] as GroupKey[]).map(key => <button key={key} onClick={() => setGroup(key)} className={`px-3 py-1.5 text-xs rounded-lg border ${group === key ? 'bg-[var(--accent)] text-white border-transparent' : 'border-[var(--border)] text-[var(--text-3)]'}`}>{key === 'brand' ? 'By Brand' : key === 'hub' ? 'By Hub' : 'By Customer'}</button>)}</div>
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder={`Search ${group}…`} className="via-input px-3 py-1.5 text-xs w-64"/>
          </div>
          <div className="overflow-x-auto"><table className="w-full text-xs"><thead className="bg-[var(--surface-2)]"><tr>{['Name','Revenue','Cost','Gross Profit','GP Margin','Qty','Invoices','Missing Costs'].map(label => <th key={label} className="px-3 py-2 text-[10px] uppercase tracking-wider text-[var(--text-3)] border-b border-[var(--border)]" style={{ textAlign: label === 'Name' ? 'left' : 'right' }}>{label}</th>)}</tr></thead><tbody>
            {rows.map(row => <tr key={row.name} className="border-b border-[var(--border-muted)]"><td className="px-3 py-2 font-semibold text-[var(--text)]">{row.name}</td><td className="px-3 py-2 text-right" style={mono}>{rp(row.revenue)}</td><td className="px-3 py-2 text-right" style={mono}>{rp(row.cost)}</td><td className={`px-3 py-2 text-right ${row.gross_profit >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`} style={mono}>{rp(row.gross_profit)}</td><td className="px-3 py-2 text-right" style={mono}>{pct(row.gp_margin)}</td><td className="px-3 py-2 text-right" style={mono}>{row.quantity.toLocaleString('id-ID')}</td><td className="px-3 py-2 text-right" style={mono}>{row.invoice_count}</td><td className={`px-3 py-2 text-right ${row.missing_cost_lines ? 'text-[var(--warning)]' : 'text-[var(--text-4)]'}`} style={mono}>{row.missing_cost_lines}</td></tr>)}
            {!loading && rows.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-[var(--text-4)]">No records for this selection.</td></tr>}
          </tbody></table></div>
          <div className="px-4 py-3 text-[var(--text-4)] text-xs bg-[var(--surface-2)] border-t border-[var(--border)]">{report.basis}</div>
        </div>
      </>}
    </div></div>
  );
}
