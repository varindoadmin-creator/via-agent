'use client';

import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Send, Inbox } from 'lucide-react';

type Status = 'DETECTED' | 'REVIEW_REQUIRED' | 'APPROVED' | 'SCHEDULED' | 'SENT' | 'CUSTOMER_RESPONDED' | 'CONVERTED' | 'DISMISSED' | 'EXPIRED' | 'FAILED' | 'CANCELLED';

interface Evidence { label: string; value: string | number }
interface Action {
  id: string; type: string; customerId: string | null; conversationId: string | null;
  reason: string; evidence: Evidence[]; recommendedAction: string;
  channel: 'WHATSAPP' | 'INTERNAL_TASK'; status: Status; priority: string;
  requiresApproval: boolean; assignedTeam: string | null; followUpStage: string | null;
  potentialValue: number | null; potentialValueLabel: string | null;
  version: number; createdAt: string;
}

const VIEWS = ['Needs Review', 'Follow Up Today', 'Reorder Opportunities', 'Quotation Follow-Ups', 'Sample Leads', 'Dormant Customers', 'Sent', 'Converted', 'Dismissed'] as const;
type View = (typeof VIEWS)[number];

function matchesView(a: Action, view: View): boolean {
  const active = !['DISMISSED', 'EXPIRED', 'CANCELLED', 'CONVERTED'].includes(a.status);
  switch (view) {
    case 'Needs Review': return active && a.status === 'REVIEW_REQUIRED';
    case 'Follow Up Today': return active && (a.status === 'DETECTED' || a.status === 'APPROVED');
    case 'Reorder Opportunities': return active && a.type === 'REORDER_OPPORTUNITY';
    case 'Quotation Follow-Ups': return active && a.type === 'QUOTATION_FOLLOW_UP';
    case 'Sample Leads': return active && a.type === 'SAMPLE_REQUEST_FOLLOW_UP';
    case 'Dormant Customers': return active && a.type === 'DORMANT_CUSTOMER_REENGAGEMENT';
    case 'Sent': return a.status === 'SENT' || a.status === 'CUSTOMER_RESPONDED';
    case 'Converted': return a.status === 'CONVERTED';
    case 'Dismissed': return a.status === 'DISMISSED' || a.status === 'EXPIRED' || a.status === 'CANCELLED' || a.status === 'FAILED';
  }
}

const STATUS_STYLE: Record<Status, string> = {
  DETECTED: 'bg-slate-100 text-slate-600', REVIEW_REQUIRED: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-blue-100 text-blue-700', SCHEDULED: 'bg-blue-100 text-blue-700', SENT: 'bg-indigo-100 text-indigo-700',
  CUSTOMER_RESPONDED: 'bg-indigo-100 text-indigo-700', CONVERTED: 'bg-emerald-100 text-emerald-700',
  DISMISSED: 'bg-slate-100 text-slate-500', EXPIRED: 'bg-slate-100 text-slate-500',
  FAILED: 'bg-red-100 text-red-700', CANCELLED: 'bg-slate-100 text-slate-500',
};

export default function SalesOpportunitiesPage() {
  const [actions, setActions] = useState<Action[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<View>('Needs Review');
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/requests/wati/sales-opportunities', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || 'Unable to load sales opportunities.');
      setActions(body.actions);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  const visible = useMemo(() => actions.filter(a => matchesView(a, view)), [actions, view]);
  const viewCount = (v: View) => actions.filter(a => matchesView(a, v)).length;

  async function act(id: string, action: string, body?: Record<string, unknown>) {
    setBusyId(id);
    try {
      const response = await fetch(`/api/requests/wati/sales-opportunities/${id}/${action}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || `Failed to ${action}.`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusyId(null); }
  }

  return <div className="min-h-full bg-[var(--surface-secondary)] p-6 lg:p-8"><div className="mx-auto max-w-[1500px] space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">Sales Opportunities</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Proactive follow-up, reorder, and re-engagement opportunities Jarvis detected deterministically. Customer outreach only ever goes out after review, unless a specific type has been explicitly enabled for automatic sending.</p></div>
      <button onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-lg bg-[#6161ff] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"><RefreshCw size={16} className={loading ? 'animate-spin' : ''}/>Refresh</button>
    </header>
    {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-4 py-3">
        {VIEWS.map(v => <button key={v} onClick={() => setView(v)} className={`rounded-md px-3 py-1.5 text-sm font-medium ${view === v ? 'bg-[#eeeeff] text-[#4141cc]' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]'}`}>{v} <span className="text-xs opacity-60">({viewCount(v)})</span></button>)}
      </div>
      <div className="divide-y divide-[var(--border)]">
        {visible.map(a => <div key={a.id} className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="font-medium text-[var(--text)]">{a.type.replace(/_/g, ' ')}{a.followUpStage ? ` · ${a.followUpStage.replace(/_/g, ' ')}` : ''}</div>
              <div className="mt-0.5 text-xs text-[var(--text-secondary)]">{a.reason}</div>
              {a.potentialValue != null && <div className="mt-0.5 text-xs text-[var(--text-secondary)]">{a.potentialValueLabel}: <span className="font-medium tabular-nums">IDR {a.potentialValue.toLocaleString('id-ID')}</span></div>}
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{a.channel === 'WHATSAPP' ? 'Customer message' : 'Internal task'}{a.assignedTeam ? ` · ${a.assignedTeam.replace(/_/g, ' ')}` : ''}</span>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[a.status]}`}>{a.status.replace(/_/g, ' ')}</span>
            </div>
          </div>
          {a.evidence.length > 0 && <div className="mt-3 flex flex-wrap gap-2">
            {a.evidence.map((e, i) => <span key={i} className="rounded-md bg-[var(--surface-2)] px-2.5 py-1 text-xs">{e.label}: <span className="font-medium tabular-nums">{e.value}</span></span>)}
          </div>}
          <p className="mt-3 text-sm text-[var(--text-secondary)]">{a.recommendedAction}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {a.status === 'REVIEW_REQUIRED' && <button disabled={busyId === a.id} onClick={() => act(a.id, 'approve', { expectedVersion: a.version })} className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">Approve</button>}
            {a.channel === 'WHATSAPP' && (a.status === 'APPROVED' || (a.status === 'DETECTED' && !a.requiresApproval)) && <button disabled={busyId === a.id} onClick={() => act(a.id, 'send-now')} className="inline-flex items-center gap-1 rounded-md bg-[#6161ff] px-2.5 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"><Send size={12}/>Send Now</button>}
            {!['DISMISSED', 'EXPIRED', 'CANCELLED', 'CONVERTED', 'SENT', 'CUSTOMER_RESPONDED'].includes(a.status) && <>
              <button disabled={busyId === a.id} onClick={() => { const reason = prompt('Dismissal reason (ALREADY_HANDLED, CUSTOMER_DECLINED, NOT_RELEVANT, DUPLICATE, POLICY_BLOCKED, OTHER):', 'NOT_RELEVANT'); if (reason) act(a.id, 'dismiss', { expectedVersion: a.version, reason }); }} className="rounded-md bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50">Dismiss</button>
            </>}
            {(a.status === 'APPROVED' || a.status === 'SCHEDULED') && <button disabled={busyId === a.id} onClick={() => act(a.id, 'cancel', { expectedVersion: a.version })} className="rounded-md bg-[var(--surface-2)] px-2.5 py-1 text-xs font-medium hover:bg-[var(--surface-3)] disabled:opacity-50">Cancel</button>}
          </div>
        </div>)}
        {!loading && !visible.length && <div className="px-4 py-12 text-center text-[var(--text-secondary)]"><Inbox className="mx-auto mb-2"/>Nothing in this view.</div>}
      </div>
    </section>
  </div></div>;
}
