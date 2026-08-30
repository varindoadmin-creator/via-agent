'use client';

import { useEffect, useMemo, useState } from 'react';
import { Inbox, RefreshCw } from 'lucide-react';

type CustomerDraft = {
  id: string; created_at: string; normalized_phone: string; company_name: string | null;
  contact_person_name: string | null; needs_faktur_pajak: boolean | null; npwp: string | null;
  billing_address: { address: string } | null; shipping_address: { address: string } | null;
  duplicate_check_status: string | null; status: string; created_customer_id: string | null;
};

const STATUS_FILTERS = ['all', 'COLLECTING_COMPANY', 'COLLECTING_TAX_REQUIREMENT', 'COLLECTING_NPWP', 'COLLECTING_BILLING_ADDRESS', 'COLLECTING_SHIPPING_ADDRESS', 'POSSIBLE_DUPLICATE', 'READY_FOR_REVIEW', 'CUSTOMER_CREATED', 'FAILED'] as const;

export default function CustomerOnboardingDashboard() {
  const [drafts, setDrafts] = useState<CustomerDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<(typeof STATUS_FILTERS)[number]>('all');
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/requests/wati/customers', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || 'Unable to load customer drafts.');
      setDrafts(body.drafts);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  const visible = useMemo(() => drafts.filter(d => filter === 'all' || d.status === filter), [drafts, filter]);

  async function act(draft: CustomerDraft, action: 'approve' | 'reject' | 'retry-sync') {
    setBusyId(draft.id);
    try {
      const response = await fetch(`/api/requests/wati/customers/${draft.id}/${action}`, { method: 'POST' });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || `Failed to ${action}.`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusyId(null); }
  }

  return <div className="min-h-full bg-[var(--surface-secondary)] p-6 lg:p-8"><div className="mx-auto max-w-[1500px] space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">Customer Onboarding</h1><p className="mt-1 text-sm text-[var(--text-secondary)]">New WhatsApp customers collected conversationally. No Zoho customer is created until Approve &amp; Create.</p></div>
      <button onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-lg bg-[#6161ff] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"><RefreshCw size={16} className={loading ? 'animate-spin' : ''}/>Refresh</button></header>
    {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
        <div className="flex flex-wrap gap-2">{STATUS_FILTERS.map(value => <button key={value} onClick={() => setFilter(value)} className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize ${filter === value ? 'bg-[#eeeeff] text-[#4141cc]' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]'}`}>{value === 'all' ? 'All' : value.replace(/_/g, ' ').toLowerCase()}</button>)}</div>
        <span className="text-xs text-[var(--text-secondary)]">Newest first</span>
      </div>
      <div className="overflow-x-auto"><table className="w-full min-w-[1300px] text-left text-sm">
        <thead className="bg-[var(--surface-secondary)] text-xs uppercase tracking-wide text-[var(--text-secondary)]"><tr>
          <th className="px-4 py-3">Started</th><th className="px-4 py-3">Phone</th><th className="px-4 py-3">Company</th>
          <th className="px-4 py-3">Faktur Pajak</th><th className="px-4 py-3">Billing Address</th><th className="px-4 py-3">Status</th>
          <th className="px-4 py-3">Action</th>
        </tr></thead>
        <tbody className="divide-y divide-[var(--border)]">{visible.map(draft => <tr key={draft.id} className="hover:bg-[var(--surface-secondary)] align-top">
          <td className="whitespace-nowrap px-4 py-3 text-[var(--text-secondary)]">{new Date(draft.created_at).toLocaleString('en-ID')}</td>
          <td className="px-4 py-3 font-medium text-[var(--text)]">{draft.normalized_phone}</td>
          <td className="px-4 py-3 text-[var(--text-secondary)]">{draft.company_name || '—'}</td>
          <td className="px-4 py-3 text-[var(--text-secondary)]">{draft.needs_faktur_pajak == null ? '—' : draft.needs_faktur_pajak ? 'Ya' : 'Tidak'}</td>
          <td className="px-4 py-3 text-[var(--text-secondary)]">{draft.billing_address?.address || '—'}</td>
          <td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{draft.status.replace(/_/g, ' ')}</span>{draft.duplicate_check_status && draft.duplicate_check_status !== 'NO_DUPLICATE' && <span className="ml-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">{draft.duplicate_check_status}</span>}</td>
          <td className="px-4 py-3">
            {draft.status === 'READY_FOR_REVIEW' && <div className="flex gap-1.5">
              <button disabled={busyId === draft.id} onClick={() => act(draft, 'approve')} className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">Approve &amp; Create</button>
              <button disabled={busyId === draft.id} onClick={() => act(draft, 'reject')} className="rounded-md bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50">Reject</button>
            </div>}
            {draft.status === 'POSSIBLE_DUPLICATE' && <span className="text-xs text-amber-700">Review possible duplicate before approving</span>}
            {draft.status === 'CUSTOMER_CREATED' && <button disabled={busyId === draft.id} onClick={() => act(draft, 'retry-sync')} className="rounded-md bg-[var(--surface-2)] px-2.5 py-1 text-xs font-medium text-[var(--text-2)] hover:bg-[var(--surface-3)] disabled:opacity-50">Retry WATI Sync</button>}
            {draft.status.startsWith('COLLECTING_') && <span className="text-xs text-[var(--text-secondary)]">Waiting on customer</span>}
          </td>
        </tr>)}{!loading && !visible.length && <tr><td colSpan={7} className="px-4 py-12 text-center text-[var(--text-secondary)]"><Inbox className="mx-auto mb-2"/>No customer drafts.</td></tr>}</tbody>
      </table></div>
    </section>
  </div></div>;
}
