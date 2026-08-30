'use client';

import { useEffect, useMemo, useState } from 'react';
import { Inbox, RefreshCw } from 'lucide-react';

type Exception = {
  id: string; created_at: string; conversation_id: string | null; customer_id: string | null;
  category: string; reason: string | null; status: string; resolved_at: string | null; resolved_by: string | null;
};

const STATUS_FILTERS = ['open', 'all', 'NEEDS_IDENTITY', 'NEEDS_HUMAN', 'PAYMENT_REVIEW', 'DELIVERY_CHECK', 'DOCUMENT_SEND_FAILED', 'ZOHO_UNAVAILABLE', 'RESOLVED'] as const;

const STATUS_STYLE: Record<string, string> = {
  NEEDS_IDENTITY: 'bg-amber-100 text-amber-700', NEEDS_HUMAN: 'bg-amber-100 text-amber-700',
  PAYMENT_REVIEW: 'bg-orange-100 text-orange-700', DELIVERY_CHECK: 'bg-blue-100 text-blue-700',
  DOCUMENT_SEND_FAILED: 'bg-red-100 text-red-700', ZOHO_UNAVAILABLE: 'bg-red-100 text-red-700',
  RESOLVED: 'bg-emerald-100 text-emerald-700',
};

export default function CustomerServiceDashboard() {
  const [exceptions, setExceptions] = useState<Exception[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<(typeof STATUS_FILTERS)[number]>('open');
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/requests/wati/customer-service', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || 'Unable to load exceptions.');
      setExceptions(body.exceptions);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  const visible = useMemo(() => exceptions.filter(e => filter === 'all' ? true : filter === 'open' ? e.status !== 'RESOLVED' : e.status === filter), [exceptions, filter]);

  async function resolve(exception: Exception) {
    setBusyId(exception.id);
    try {
      const response = await fetch(`/api/requests/wati/customer-service/${exception.id}/resolve`, { method: 'POST' });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || 'Failed to resolve.');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusyId(null); }
  }

  return <div className="min-h-full bg-[var(--surface-secondary)] p-6 lg:p-8"><div className="mx-auto max-w-[1300px] space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">Customer Service</h1><p className="mt-1 text-sm text-[var(--text-secondary)]">Exception queue only — most self-service order/invoice/payment questions resolve straight-through and never appear here.</p></div>
      <button onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-lg bg-[#6161ff] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"><RefreshCw size={16} className={loading ? 'animate-spin' : ''}/>Refresh</button></header>
    {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
        <div className="flex flex-wrap gap-2">{STATUS_FILTERS.map(value => <button key={value} onClick={() => setFilter(value)} className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize ${filter === value ? 'bg-[#eeeeff] text-[#4141cc]' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]'}`}>{value === 'all' ? 'All' : value === 'open' ? 'Open' : value.replace(/_/g, ' ').toLowerCase()}</button>)}</div>
        <span className="text-xs text-[var(--text-secondary)]">Newest first</span>
      </div>
      <div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-left text-sm">
        <thead className="bg-[var(--surface-secondary)] text-xs uppercase tracking-wide text-[var(--text-secondary)]"><tr>
          <th className="px-4 py-3">Created</th><th className="px-4 py-3">Conversation</th><th className="px-4 py-3">Category</th>
          <th className="px-4 py-3">Reason</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Action</th>
        </tr></thead>
        <tbody className="divide-y divide-[var(--border)]">{visible.map(exception => <tr key={exception.id} className="hover:bg-[var(--surface-secondary)] align-top">
          <td className="whitespace-nowrap px-4 py-3 text-[var(--text-secondary)]">{new Date(exception.created_at).toLocaleString('en-ID')}</td>
          <td className="px-4 py-3 font-medium text-[var(--text)]">{exception.conversation_id || '—'}</td>
          <td className="px-4 py-3 text-[var(--text-secondary)]">{exception.category}</td>
          <td className="px-4 py-3 text-[var(--text-secondary)] max-w-sm truncate" title={exception.reason ?? ''}>{exception.reason || '—'}</td>
          <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[exception.status] || 'bg-slate-100 text-slate-600'}`}>{exception.status.replace(/_/g, ' ')}</span></td>
          <td className="px-4 py-3">{exception.status !== 'RESOLVED' && <button disabled={busyId === exception.id} onClick={() => resolve(exception)} className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">Mark Resolved</button>}</td>
        </tr>)}{!loading && !visible.length && <tr><td colSpan={6} className="px-4 py-12 text-center text-[var(--text-secondary)]"><Inbox className="mx-auto mb-2"/>No exceptions in this view.</td></tr>}</tbody>
      </table></div>
    </section>
  </div></div>;
}
