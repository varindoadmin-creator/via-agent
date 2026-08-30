'use client';

import { useEffect, useMemo, useState } from 'react';
import { Inbox, RefreshCw } from 'lucide-react';

type Message = {
  id: string; received_at: string; customer_name: string | null; customer_phone_raw: string | null;
  customer_resolution: string | null; text: string | null; intent: string | null; product_name: string | null;
  item_code: string | null; source: string | null; processing_status: string | null; response_type: string | null;
};

const INTENT_FILTERS = ['all', 'STOCK_CHECK', 'PRODUCT_INQUIRY', 'GREETING', 'HUMAN_REQUEST'] as const;

export default function WatiInboxPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<(typeof INTENT_FILTERS)[number]>('all');

  async function load() {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/requests/wati', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || 'Unable to load WATI inquiries.');
      setMessages(body.messages);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  const visible = useMemo(() => messages.filter(m => filter === 'all' || m.intent === filter), [messages, filter]);
  const humanRequests = messages.filter(m => m.intent === 'HUMAN_REQUEST').length;

  return <div className="min-h-full bg-[var(--surface-secondary)] p-6 lg:p-8"><div className="mx-auto max-w-[1500px] space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">WATI Inquiries</h1><p className="mt-1 text-sm text-[var(--text-secondary)]">Inbound WhatsApp customer inquiries and VIA's automated responses. WATI remains the human messaging inbox.</p></div>
      <button onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-lg bg-[#6161ff] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"><RefreshCw size={16} className={loading ? 'animate-spin' : ''}/>Refresh</button></header>
    {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    <div className="grid gap-3 sm:grid-cols-3">
      <Card label="Inquiries received" value={messages.length}/>
      <Card label="Needs human follow-up" value={humanRequests} warn={humanRequests > 0}/>
      <Card label="Stock checks" value={messages.filter(m => m.intent === 'STOCK_CHECK').length}/>
    </div>
    <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
        <div className="flex flex-wrap gap-2">{INTENT_FILTERS.map(value => <button key={value} onClick={() => setFilter(value)} className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize ${filter === value ? 'bg-[#eeeeff] text-[#4141cc]' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]'}`}>{value === 'all' ? 'All' : value.replace('_', ' ').toLowerCase()}</button>)}</div>
        <span className="text-xs text-[var(--text-secondary)]">Last 100 inquiries · newest first</span>
      </div>
      <div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-left text-sm">
        <thead className="bg-[var(--surface-secondary)] text-xs uppercase tracking-wide text-[var(--text-secondary)]"><tr>
          <th className="px-4 py-3">Received</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Message</th>
          <th className="px-4 py-3">Intent</th><th className="px-4 py-3">Product</th><th className="px-4 py-3">Source</th>
          <th className="px-4 py-3">Status</th><th className="px-4 py-3">Auto/Human</th>
        </tr></thead>
        <tbody className="divide-y divide-[var(--border)]">{visible.map(m => <tr key={m.id} className="hover:bg-[var(--surface-secondary)]">
          <td className="whitespace-nowrap px-4 py-3 text-[var(--text-secondary)]">{new Date(m.received_at).toLocaleString('en-ID')}</td>
          <td className="px-4 py-3 font-medium text-[var(--text)]">{m.customer_name || m.customer_phone_raw || '—'}{m.customer_resolution === 'MATCHED' && <span className="ml-1.5 text-xs text-emerald-600">✓</span>}</td>
          <td className="max-w-sm truncate px-4 py-3 text-[var(--text)]" title={m.text || ''}>{m.text || '—'}</td>
          <td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{m.intent || 'UNKNOWN'}</span></td>
          <td className="px-4 py-3 text-[var(--text-secondary)]">{m.product_name || m.item_code || '—'}</td>
          <td className="px-4 py-3 text-[var(--text-secondary)]">{m.source || '—'}</td>
          <td className="px-4 py-3 text-[var(--text-secondary)]">{m.processing_status || '—'}</td>
          <td className="px-4 py-3">{m.intent === 'HUMAN_REQUEST' ? <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">Human</span> : <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">Auto</span>}</td>
        </tr>)}{!loading && !visible.length && <tr><td colSpan={8} className="px-4 py-12 text-center text-[var(--text-secondary)]"><Inbox className="mx-auto mb-2"/>No WATI inquiries yet.</td></tr>}</tbody>
      </table></div>
    </section>
  </div></div>;
}

function Card({ label, value, warn = false }: { label: string; value: string | number; warn?: boolean }) {
  return <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"><div className="text-sm text-[var(--text-secondary)]">{label}</div><div className={`mt-2 text-2xl font-semibold ${warn ? 'text-amber-600' : 'text-[var(--text)]'}`}>{value}</div></div>;
}
