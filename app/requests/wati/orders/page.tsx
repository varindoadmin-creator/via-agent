'use client';

import { useEffect, useMemo, useState } from 'react';
import { Inbox, RefreshCw } from 'lucide-react';

type Line = { id: string; item_code: string | null; product_name: string; quantity: number; unit: string | null; approved_unit_price: number | null; stock_status: string; stock_inquiry_id: string | null };
type Draft = {
  id: string; created_at: string; type: 'QUOTATION' | 'SALES_ORDER'; conversation_id: string | null;
  customer_id: string | null; status: string; total: number | null; currency: string;
  zoho_object_number: string | null; lines: Line[];
};

const STATUS_FILTERS = ['all', 'NEEDS_CUSTOMER', 'CUSTOMER_ONBOARDING', 'NEEDS_DELIVERY_INFO', 'NEEDS_PRICE', 'READY_FOR_REVIEW', 'COMPLETED', 'FAILED'] as const;

const STOCK_STYLE: Record<string, string> = {
  SUFFICIENT: 'bg-emerald-100 text-emerald-700', INSUFFICIENT: 'bg-amber-100 text-amber-700',
  OUT_OF_STOCK: 'bg-red-100 text-red-700', PENDING: 'bg-slate-100 text-slate-600', UNKNOWN: 'bg-slate-100 text-slate-600',
};

export default function CustomerOrdersDashboard() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<(typeof STATUS_FILTERS)[number]>('all');
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/requests/wati/orders', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || 'Unable to load commercial drafts.');
      setDrafts(body.drafts);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  const visible = useMemo(() => drafts.filter(d => filter === 'all' || d.status === filter), [drafts, filter]);

  async function act(draft: Draft, action: 'approve' | 'reject' | 'refresh-stock') {
    setBusyId(draft.id);
    try {
      const response = await fetch(`/api/requests/wati/orders/${draft.id}/${action}`, { method: 'POST' });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || `Failed to ${action}.`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusyId(null); }
  }

  return <div className="min-h-full bg-[var(--surface-secondary)] p-6 lg:p-8"><div className="mx-auto max-w-[1500px] space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">Customer Orders</h1><p className="mt-1 text-sm text-[var(--text-secondary)]">WhatsApp order/quotation drafts. No Zoho Sales Order or Quotation is created until Approve &amp; Create.</p></div>
      <button onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-lg bg-[#6161ff] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"><RefreshCw size={16} className={loading ? 'animate-spin' : ''}/>Refresh</button></header>
    {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
        <div className="flex flex-wrap gap-2">{STATUS_FILTERS.map(value => <button key={value} onClick={() => setFilter(value)} className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize ${filter === value ? 'bg-[#eeeeff] text-[#4141cc]' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]'}`}>{value === 'all' ? 'All' : value.replace(/_/g, ' ').toLowerCase()}</button>)}</div>
        <span className="text-xs text-[var(--text-secondary)]">Newest first</span>
      </div>
      <div className="overflow-x-auto"><table className="w-full min-w-[1400px] text-left text-sm">
        <thead className="bg-[var(--surface-secondary)] text-xs uppercase tracking-wide text-[var(--text-secondary)]"><tr>
          <th className="px-4 py-3">Created</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Conversation</th>
          <th className="px-4 py-3">Product</th><th className="px-4 py-3">Qty</th><th className="px-4 py-3">Stock</th>
          <th className="px-4 py-3">Total</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Action</th>
        </tr></thead>
        <tbody className="divide-y divide-[var(--border)]">{visible.map(draft => { const line = draft.lines[0]; return <tr key={draft.id} className="hover:bg-[var(--surface-secondary)] align-top">
          <td className="whitespace-nowrap px-4 py-3 text-[var(--text-secondary)]">{new Date(draft.created_at).toLocaleString('en-ID')}</td>
          <td className="px-4 py-3 text-[var(--text-secondary)]">{draft.type === 'QUOTATION' ? 'Quotation' : 'Sales Order'}</td>
          <td className="px-4 py-3 font-medium text-[var(--text)]">{draft.conversation_id || '—'}</td>
          <td className="px-4 py-3 text-[var(--text-secondary)]">{line ? (line.item_code || line.product_name) : '—'}</td>
          <td className="px-4 py-3 text-[var(--text-secondary)]">{line ? `${line.quantity} ${line.unit || ''}` : '—'}</td>
          <td className="px-4 py-3">{line && <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STOCK_STYLE[line.stock_status] || STOCK_STYLE.UNKNOWN}`}>{line.stock_status}</span>}</td>
          <td className="px-4 py-3 text-[var(--text-secondary)]">{draft.total != null ? `${draft.currency} ${draft.total.toLocaleString('id-ID')}` : '—'}</td>
          <td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{draft.status.replace(/_/g, ' ')}</span>{draft.zoho_object_number && <div className="mt-1 text-xs text-emerald-700">{draft.zoho_object_number}</div>}</td>
          <td className="px-4 py-3">
            {draft.status === 'READY_FOR_REVIEW' && <div className="flex flex-col gap-1.5">
              <div className="flex gap-1.5">
                <button disabled={busyId === draft.id} onClick={() => act(draft, 'approve')} className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">Approve &amp; Create</button>
                <button disabled={busyId === draft.id} onClick={() => act(draft, 'reject')} className="rounded-md bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50">Reject</button>
              </div>
              {line?.stock_status === 'PENDING' && <button disabled={busyId === draft.id} onClick={() => act(draft, 'refresh-stock')} className="self-start rounded-md bg-[var(--surface-2)] px-2.5 py-1 text-xs font-medium text-[var(--text-2)] hover:bg-[var(--surface-3)] disabled:opacity-50">Refresh Stock Status</button>}
            </div>}
            {(draft.status === 'NEEDS_CUSTOMER' || draft.status === 'CUSTOMER_ONBOARDING' || draft.status === 'NEEDS_DELIVERY_INFO' || draft.status === 'NEEDS_PRICE') && <span className="text-xs text-[var(--text-secondary)]">Waiting on customer</span>}
          </td>
        </tr>; })}{!loading && !visible.length && <tr><td colSpan={9} className="px-4 py-12 text-center text-[var(--text-secondary)]"><Inbox className="mx-auto mb-2"/>No commercial drafts.</td></tr>}</tbody>
      </table></div>
    </section>
  </div></div>;
}
