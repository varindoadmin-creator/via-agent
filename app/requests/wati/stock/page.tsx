'use client';

import { useEffect, useMemo, useState } from 'react';
import { Inbox, RefreshCw } from 'lucide-react';

type Inquiry = {
  id: string; created_at: string; conversation_id: string; customer_id: string | null;
  item_code: string | null; brand: string | null; requested_quantity: number | null; requested_unit: string | null;
  status: string; source: string | null; checkRequestId: string | null; checkRequestStatus: string | null;
  prepared_response_text: string | null; human_required: boolean; next_eligible_check_at: string | null;
  sla: 'ON_TIME' | 'WARNING' | 'BREACHED';
};

const STATUS_FILTERS = ['all', 'WAITING_FOR_VENDOR', 'VENDOR_CLOSED', 'NEEDS_QUANTITY', 'NEEDS_HUMAN', 'RESPONSE_READY'] as const;

const SLA_STYLE: Record<Inquiry['sla'], string> = {
  ON_TIME: 'bg-emerald-100 text-emerald-700',
  WARNING: 'bg-amber-100 text-amber-700',
  BREACHED: 'bg-red-100 text-red-700',
};

export default function StockInquiryDashboard() {
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<(typeof STATUS_FILTERS)[number]>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [textDraft, setTextDraft] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/requests/wati/stock', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || 'Unable to load stock inquiries.');
      setInquiries(body.inquiries);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  const visible = useMemo(() => inquiries.filter(i => filter === 'all' || i.status === filter), [inquiries, filter]);

  async function recordVendor(inquiry: Inquiry, action: 'available' | 'out_of_stock' | 'text') {
    if (!inquiry.checkRequestId) return;
    setBusyId(inquiry.id);
    try {
      const rawText = textDraft[inquiry.id];
      const response = await fetch(`/api/requests/wati/stock/check-requests/${inquiry.checkRequestId}/respond`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action === 'text' ? { action, rawText } : { action }),
      });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || 'Failed to record vendor response.');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusyId(null); }
  }

  async function sendReply(inquiry: Inquiry) {
    setBusyId(inquiry.id);
    try {
      const response = await fetch(`/api/requests/wati/stock/inquiries/${inquiry.id}/send`, { method: 'POST' });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || 'Failed to send reply.');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusyId(null); }
  }

  return <div className="min-h-full bg-[var(--surface-secondary)] p-6 lg:p-8"><div className="mx-auto max-w-[1500px] space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">Stock Inquiries</h1><p className="mt-1 text-sm text-[var(--text-secondary)]">Vendor is always checked first. Exact quantities are never shown to customers — only sufficiency.</p></div>
      <button onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-lg bg-[#6161ff] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"><RefreshCw size={16} className={loading ? 'animate-spin' : ''}/>Refresh</button></header>
    {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
        <div className="flex flex-wrap gap-2">{STATUS_FILTERS.map(value => <button key={value} onClick={() => setFilter(value)} className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize ${filter === value ? 'bg-[#eeeeff] text-[#4141cc]' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]'}`}>{value === 'all' ? 'All' : value.replace(/_/g, ' ').toLowerCase()}</button>)}</div>
        <span className="text-xs text-[var(--text-secondary)]">Open inquiries · newest first</span>
      </div>
      <div className="overflow-x-auto"><table className="w-full min-w-[1300px] text-left text-sm">
        <thead className="bg-[var(--surface-secondary)] text-xs uppercase tracking-wide text-[var(--text-secondary)]"><tr>
          <th className="px-4 py-3">Age</th><th className="px-4 py-3">Conversation</th><th className="px-4 py-3">Product</th>
          <th className="px-4 py-3">Requested</th><th className="px-4 py-3">Source</th><th className="px-4 py-3">Status</th>
          <th className="px-4 py-3">SLA</th><th className="px-4 py-3">Next Action</th>
        </tr></thead>
        <tbody className="divide-y divide-[var(--border)]">{visible.map(inquiry => <tr key={inquiry.id} className="hover:bg-[var(--surface-secondary)] align-top">
          <td className="whitespace-nowrap px-4 py-3 text-[var(--text-secondary)]">{new Date(inquiry.created_at).toLocaleString('en-ID')}</td>
          <td className="px-4 py-3 font-medium text-[var(--text)]">{inquiry.conversation_id}</td>
          <td className="px-4 py-3 text-[var(--text-secondary)]">{inquiry.item_code || inquiry.brand || '—'}</td>
          <td className="px-4 py-3 text-[var(--text-secondary)]">{inquiry.requested_quantity ? `${inquiry.requested_quantity} ${inquiry.requested_unit || ''}` : '—'}</td>
          <td className="px-4 py-3 text-[var(--text-secondary)]">{inquiry.source || '—'}</td>
          <td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{inquiry.status.replace(/_/g, ' ')}</span>{inquiry.human_required && <span className="ml-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">HUMAN</span>}</td>
          <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${SLA_STYLE[inquiry.sla]}`}>{inquiry.sla}</span></td>
          <td className="px-4 py-3">
            {(inquiry.status === 'WAITING_FOR_VENDOR' || inquiry.status === 'VENDOR_CLOSED') && inquiry.checkRequestId && <div className="flex flex-col gap-1.5">
              <div className="flex gap-1.5">
                <button disabled={busyId === inquiry.id} onClick={() => recordVendor(inquiry, 'available')} className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">Record Available</button>
                <button disabled={busyId === inquiry.id} onClick={() => recordVendor(inquiry, 'out_of_stock')} className="rounded-md bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50">Record OOS</button>
              </div>
              <div className="flex gap-1.5">
                <input value={textDraft[inquiry.id] || ''} onChange={e => setTextDraft(d => ({ ...d, [inquiry.id]: e.target.value }))} placeholder="e.g. ada 75" className="w-32 rounded-md border border-[var(--border)] px-2 py-1 text-xs"/>
                <button disabled={busyId === inquiry.id || !textDraft[inquiry.id]} onClick={() => recordVendor(inquiry, 'text')} className="rounded-md bg-[var(--surface-2)] px-2.5 py-1 text-xs font-medium text-[var(--text-2)] hover:bg-[var(--surface-3)] disabled:opacity-50">Enter Response</button>
              </div>
            </div>}
            {inquiry.status === 'RESPONSE_READY' && <div className="flex flex-col gap-1.5 max-w-xs">
              <p className="text-xs text-[var(--text-secondary)] italic">&ldquo;{inquiry.prepared_response_text}&rdquo;</p>
              <button disabled={busyId === inquiry.id} onClick={() => sendReply(inquiry)} className="self-start rounded-md bg-[#6161ff] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#4f4fe0] disabled:opacity-50">Send Reply</button>
            </div>}
            {inquiry.status === 'NEEDS_HUMAN' && <span className="text-xs text-amber-700">Needs manual follow-up</span>}
            {inquiry.status === 'NEEDS_QUANTITY' && <span className="text-xs text-[var(--text-secondary)]">Waiting on customer</span>}
          </td>
        </tr>)}{!loading && !visible.length && <tr><td colSpan={8} className="px-4 py-12 text-center text-[var(--text-secondary)]"><Inbox className="mx-auto mb-2"/>No open stock inquiries.</td></tr>}</tbody>
      </table></div>
    </section>
  </div></div>;
}
