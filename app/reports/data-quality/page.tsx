'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import type { DataQualityIssue } from '@/lib/dataQuality/analyze';

type Result = { generated_at: string; issues: DataQualityIssue[]; checks: Record<string, number>; severity: Record<'high'|'medium'|'low', number> };
const labels: Record<string, string> = {
  duplicate_customers: 'Duplicate customers', missing_customer_information: 'Missing salesperson / tax',
  invalid_contact_information: 'Invalid phone / email', invoices_without_locations: 'Invoices without locations',
  items_missing_purchase_rates: 'Missing purchase rates', items_missing_price_lists: 'Missing from price lists',
  document_relationships: 'Document relationships',
};

export default function DataQualityPage() {
  const [data, setData] = useState<Result>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  async function load() {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/data-quality', { cache: 'no-store' });
      if (!(response.headers.get('content-type') || '').includes('application/json')) throw new Error(`Server returned ${response.status} instead of JSON.`);
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || 'Scan failed.');
      setData(body); setPage(1);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  const filtered = useMemo(() => data?.issues.filter(i => filter === 'all' || i.check === filter) || [], [data, filter]);
  const pages = Math.max(1, Math.ceil(filtered.length / 50));
  const visible = filtered.slice((page - 1) * 50, page * 50);
  return <div className="min-h-full bg-[var(--surface-secondary)] p-6 lg:p-8"><div className="mx-auto max-w-[1600px] space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">Data Quality Monitor</h1><p className="mt-1 text-sm text-[var(--text-secondary)]">Daily advisory checks. This report never changes Zoho records.</p></div>
      <button onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-lg bg-[#6161ff] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"><RefreshCw size={16} className={loading ? 'animate-spin' : ''}/>Run checks</button></header>
    {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Card label="Issues found" value={data?.issues.length || 0}/><Card label="High priority" value={data?.severity.high || 0} tone="red"/><Card label="Medium priority" value={data?.severity.medium || 0} tone="amber"/><Card label="Checks completed" value={data ? 7 : 0} tone="green"/>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">{Object.entries(labels).map(([key, label]) => <button key={key} onClick={() => { setFilter(key); setPage(1); }} className={`rounded-lg border p-3 text-left ${filter === key ? 'border-[#6161ff] bg-[#eeeeff]' : 'border-[var(--border)] bg-[var(--surface)]'}`}><div className="text-2xl font-semibold text-[var(--text)]">{data?.checks[key] || 0}</div><div className="mt-1 text-xs text-[var(--text-secondary)]">{label}</div></button>)}</div>
    <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex justify-between border-b border-[var(--border)] px-4 py-3"><div><b className="text-sm text-[var(--text)]">Findings</b>{data && <span className="ml-2 text-xs text-[var(--text-secondary)]">Updated {new Date(data.generated_at).toLocaleString('en-ID')}</span>}</div>{filter !== 'all' && <button onClick={() => { setFilter('all'); setPage(1); }} className="text-sm text-[#6161ff]">Show all</button>}</div>
      <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="bg-[var(--surface-secondary)] text-xs uppercase tracking-wide text-[var(--text-secondary)]"><tr><th className="px-4 py-3">Priority</th><th className="px-4 py-3">Check</th><th className="px-4 py-3">Record</th><th className="px-4 py-3">Finding</th><th className="px-4 py-3">Evidence</th><th className="px-4 py-3">Recommended action</th></tr></thead>
        <tbody className="divide-y divide-[var(--border)]">{visible.map(i => <tr key={i.id} className="hover:bg-[var(--surface-secondary)]"><td className="px-4 py-3"><Severity value={i.severity}/></td><td className="px-4 py-3 text-[var(--text-secondary)]">{labels[i.check]}</td><td className="px-4 py-3 font-medium text-[var(--text)]">{i.entityName}</td><td className="px-4 py-3 text-[var(--text)]">{i.message}</td><td className="max-w-xs px-4 py-3 text-[var(--text-secondary)]">{i.evidence}</td><td className="max-w-sm px-4 py-3 text-[var(--text-secondary)]">{i.suggestedAction}</td></tr>)}
        {!loading && !visible.length && <tr><td colSpan={6} className="px-4 py-12 text-center text-[var(--text-secondary)]"><CheckCircle2 className="mx-auto mb-2"/>No findings for this check.</td></tr>}</tbody></table></div>
      <div className="flex items-center justify-between border-t border-[var(--border)] px-4 py-3 text-sm text-[var(--text-secondary)]"><span>{filtered.length} findings · 50 rows per page</span><div className="flex gap-3"><button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="disabled:opacity-40">Previous</button><span>{page} / {pages}</span><button disabled={page >= pages} onClick={() => setPage(p => p + 1)} className="disabled:opacity-40">Next</button></div></div>
    </section>
  </div></div>;
}

function Card({ label, value, tone = 'blue' }: { label: string; value: number; tone?: 'blue'|'red'|'amber'|'green' }) {
  const color = { blue: 'text-blue-700', red: 'text-red-700', amber: 'text-amber-700', green: 'text-emerald-700' }[tone];
  return <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"><div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]"><AlertTriangle size={15}/>{label}</div><div className={`mt-2 text-3xl font-semibold ${color}`}>{value}</div></div>;
}
function Severity({ value }: { value: 'high'|'medium'|'low' }) { const color = value === 'high' ? 'bg-red-100 text-red-700' : value === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'; return <span className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${color}`}>{value}</span>; }
