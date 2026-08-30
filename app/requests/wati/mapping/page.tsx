'use client';

import { useEffect, useState } from 'react';
import { Inbox, RefreshCw } from 'lucide-react';

type Mapping = {
  id: string; normalized_phone: string; customer_id: string; customer_name: string;
  relationship_status: string; source: string; created_at: string;
};

export default function CustomerMappingDashboard() {
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/requests/wati/mapping', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || 'Unable to load mappings.');
      setMappings(body.mappings);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function disable(mapping: Mapping) {
    if (!confirm(`Disable the mapping between ${mapping.normalized_phone} and ${mapping.customer_name}?`)) return;
    setBusyId(mapping.id);
    try {
      const response = await fetch(`/api/requests/wati/mapping/${mapping.id}/disable`, { method: 'POST' });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || 'Failed to disable mapping.');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusyId(null); }
  }

  return <div className="min-h-full bg-[var(--surface-secondary)] p-6 lg:p-8"><div className="mx-auto max-w-[1200px] space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">WhatsApp ↔ Customer Mapping</h1><p className="mt-1 text-sm text-[var(--text-secondary)]">VIA — not WATI tags or Jarvis memory — is the source of truth for which Zoho customer a WhatsApp number belongs to.</p></div>
      <button onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-lg bg-[#6161ff] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"><RefreshCw size={16} className={loading ? 'animate-spin' : ''}/>Refresh</button></header>
    {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm">
        <thead className="bg-[var(--surface-secondary)] text-xs uppercase tracking-wide text-[var(--text-secondary)]"><tr>
          <th className="px-4 py-3">Linked</th><th className="px-4 py-3">Phone</th><th className="px-4 py-3">Zoho Customer</th>
          <th className="px-4 py-3">Relationship</th><th className="px-4 py-3">Source</th><th className="px-4 py-3">Action</th>
        </tr></thead>
        <tbody className="divide-y divide-[var(--border)]">{mappings.map(mapping => <tr key={mapping.id} className="hover:bg-[var(--surface-secondary)]">
          <td className="whitespace-nowrap px-4 py-3 text-[var(--text-secondary)]">{new Date(mapping.created_at).toLocaleString('en-ID')}</td>
          <td className="px-4 py-3 font-medium text-[var(--text)]">{mapping.normalized_phone}</td>
          <td className="px-4 py-3 text-[var(--text-secondary)]">{mapping.customer_name}</td>
          <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${mapping.relationship_status === 'VERIFIED' ? 'bg-emerald-100 text-emerald-700' : mapping.relationship_status === 'DISABLED' ? 'bg-slate-200 text-slate-500' : 'bg-amber-100 text-amber-700'}`}>{mapping.relationship_status}</span></td>
          <td className="px-4 py-3 text-[var(--text-secondary)]">{mapping.source.replace(/_/g, ' ')}</td>
          <td className="px-4 py-3">{mapping.relationship_status !== 'DISABLED' && <button disabled={busyId === mapping.id} onClick={() => disable(mapping)} className="rounded-md bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50">Disable</button>}</td>
        </tr>)}{!loading && !mappings.length && <tr><td colSpan={6} className="px-4 py-12 text-center text-[var(--text-secondary)]"><Inbox className="mx-auto mb-2"/>No mappings yet.</td></tr>}</tbody>
      </table></div>
    </section>
  </div></div>;
}
