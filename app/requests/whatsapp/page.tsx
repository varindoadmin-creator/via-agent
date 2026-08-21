'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Inbox, RefreshCw } from 'lucide-react';

type Event = {
  id: string; external_event_id: string; event_type: 'message' | 'status' | 'unknown'; received_at: string; status: string;
  from: string | null; message_type: string | null; message_text: string | null; event_status: string | null;
};

export default function WhatsAppInboxPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'message' | 'status'>('all');

  async function load() {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/whatsapp/events', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || 'Unable to load WhatsApp events.');
      setEvents(body.events);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  const visible = useMemo(() => events.filter(event => filter === 'all' || event.event_type === filter), [events, filter]);
  const messages = events.filter(event => event.event_type === 'message').length;

  return <div className="min-h-full bg-[var(--surface-secondary)] p-6 lg:p-8"><div className="mx-auto max-w-[1500px] space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">WhatsApp Inbox</h1><p className="mt-1 text-sm text-[var(--text-secondary)]">Inbound WhatsApp events only. VIA does not send replies from this page.</p></div>
      <button onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-lg bg-[#6161ff] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"><RefreshCw size={16} className={loading ? 'animate-spin' : ''}/>Refresh</button></header>
    {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    <div className="grid gap-3 sm:grid-cols-3"><Card label="Events received" value={events.length}/><Card label="Incoming messages" value={messages}/><Card label="Connection" value="Healthy" success/></div>
    <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3"><div className="flex gap-2">{(['all', 'message', 'status'] as const).map(value => <button key={value} onClick={() => setFilter(value)} className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize ${filter === value ? 'bg-[#eeeeff] text-[#4141cc]' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]'}`}>{value === 'all' ? 'All events' : `${value}s`}</button>)}</div><span className="text-xs text-[var(--text-secondary)]">Last 100 events · newest first</span></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-[var(--surface-secondary)] text-xs uppercase tracking-wide text-[var(--text-secondary)]"><tr><th className="px-4 py-3">Received</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">From</th><th className="px-4 py-3">Message / status</th><th className="px-4 py-3">State</th></tr></thead><tbody className="divide-y divide-[var(--border)]">{visible.map(event => <tr key={event.id} className="hover:bg-[var(--surface-secondary)]"><td className="whitespace-nowrap px-4 py-3 text-[var(--text-secondary)]">{new Date(event.received_at).toLocaleString('en-ID')}</td><td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${event.event_type === 'message' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{event.message_type || event.event_type}</span></td><td className="px-4 py-3 font-medium text-[var(--text)]">{event.from || '—'}</td><td className="max-w-xl px-4 py-3 text-[var(--text)]">{event.message_text || event.event_status || 'Non-text message received'}</td><td className="px-4 py-3 text-[var(--text-secondary)]">{event.status}</td></tr>)}{!loading && !visible.length && <tr><td colSpan={5} className="px-4 py-12 text-center text-[var(--text-secondary)]"><Inbox className="mx-auto mb-2"/>No WhatsApp events received yet.</td></tr>}</tbody></table></div></section>
  </div></div>;
}

function Card({ label, value, success = false }: { label: string; value: string | number; success?: boolean }) { return <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"><div className="text-sm text-[var(--text-secondary)]">{label}</div><div className={`mt-2 flex items-center gap-2 text-2xl font-semibold ${success ? 'text-emerald-700' : 'text-[var(--text)]'}`}>{success && <CheckCircle2 size={20}/>} {value}</div></div>; }
