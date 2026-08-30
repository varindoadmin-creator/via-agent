'use client';

import { useEffect, useMemo, useState } from 'react';
import { Inbox, RefreshCw, Sparkles } from 'lucide-react';

type ServiceCase = {
  customer_phone_normalized: string; state: string; priority: string;
  assigned_role: string | null; assigned_team: string | null; handoff_reason: string | null;
  handoff_created_at: string | null; human_assigned_at: string | null; resolved_at: string | null;
  active_customer_id: string | null; updated_at: string;
  waitingState: 'WAITING_CUSTOMER' | 'WAITING_INTERNAL' | 'WAITING_VENDOR' | null;
  slaStatus: 'ON_TIME' | 'WARNING' | 'BREACHED' | null;
  lastCustomerMessage: string | null; customerName: string | null;
};

const VIEWS = ['Needs Attention', 'Unassigned', 'Waiting Customer', 'Waiting Internal', 'Waiting Vendor', 'SLA Warning', 'SLA Breached', 'Resolved'] as const;
type View = (typeof VIEWS)[number];

const PRIORITY_STYLE: Record<string, string> = {
  LOW: 'bg-slate-100 text-slate-600', NORMAL: 'bg-slate-100 text-slate-600',
  HIGH: 'bg-amber-100 text-amber-700', URGENT: 'bg-red-100 text-red-700',
};
const SLA_STYLE: Record<string, string> = {
  ON_TIME: 'bg-emerald-100 text-emerald-700', WARNING: 'bg-amber-100 text-amber-700', BREACHED: 'bg-red-100 text-red-700',
};
const TEAMS = ['CUSTOMER_SERVICE', 'SALES', 'FINANCE', 'OPERATIONS', 'MANAGEMENT'] as const;

function matchesView(c: ServiceCase, view: View): boolean {
  switch (view) {
    case 'Needs Attention': return c.state === 'NEEDS_HUMAN' || c.state === 'HUMAN_ASSIGNED' || c.state === 'HUMAN_ACTIVE';
    case 'Unassigned': return (c.state === 'NEEDS_HUMAN') && !c.assigned_role;
    case 'Waiting Customer': return c.waitingState === 'WAITING_CUSTOMER';
    case 'Waiting Internal': return c.waitingState === 'WAITING_INTERNAL';
    case 'Waiting Vendor': return c.waitingState === 'WAITING_VENDOR';
    case 'SLA Warning': return c.slaStatus === 'WARNING';
    case 'SLA Breached': return c.slaStatus === 'BREACHED';
    case 'Resolved': return c.state === 'RESOLVED' || c.state === 'CLOSED';
  }
}

export default function CustomerServiceDashboard() {
  const [cases, setCases] = useState<ServiceCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<View>('Needs Attention');
  const [busyPhone, setBusyPhone] = useState<string | null>(null);
  const [copilot, setCopilot] = useState<Record<string, { summary?: string; draft?: string; loading?: 'summarize' | 'suggest-reply' }>>({});

  async function load() {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/requests/wati/customer-service/cases', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || 'Unable to load the queue.');
      setCases(body.cases);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  const visible = useMemo(() => cases.filter(c => matchesView(c, view)), [cases, view]);
  const viewCount = (v: View) => cases.filter(c => matchesView(c, v)).length;

  async function act(phone: string, action: string, body?: Record<string, unknown>) {
    setBusyPhone(phone);
    try {
      const response = await fetch(`/api/requests/wati/customer-service/cases/${encodeURIComponent(phone)}/${action}`, {
        method: 'POST', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined,
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || `Failed to ${action}.`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusyPhone(null); }
  }

  async function runCopilot(phone: string, kind: 'summarize' | 'suggest-reply') {
    setCopilot(c => ({ ...c, [phone]: { ...c[phone], loading: kind } }));
    try {
      const response = await fetch(`/api/requests/wati/customer-service/cases/${encodeURIComponent(phone)}/${kind}`, { method: 'POST' });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || 'Copilot request failed.');
      setCopilot(c => ({ ...c, [phone]: { ...c[phone], loading: undefined, [kind === 'summarize' ? 'summary' : 'draft']: kind === 'summarize' ? body.summary : body.draft } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setCopilot(c => ({ ...c, [phone]: { ...c[phone], loading: undefined } }));
    }
  }

  return <div className="min-h-full bg-[var(--surface-secondary)] p-6 lg:p-8"><div className="mx-auto max-w-[1500px] space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">Customer Service</h1><p className="mt-1 text-sm text-[var(--text-secondary)]">VIA handles routine work automatically. This queue is only what needs a human.</p></div>
      <button onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-lg bg-[#6161ff] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"><RefreshCw size={16} className={loading ? 'animate-spin' : ''}/>Refresh</button></header>
    {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-4 py-3">
        {VIEWS.map(v => <button key={v} onClick={() => setView(v)} className={`rounded-md px-3 py-1.5 text-sm font-medium ${view === v ? 'bg-[#eeeeff] text-[#4141cc]' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]'}`}>{v} <span className="text-xs opacity-60">({viewCount(v)})</span></button>)}
      </div>
      <div className="overflow-x-auto"><table className="w-full min-w-[1500px] text-left text-sm">
        <thead className="bg-[var(--surface-secondary)] text-xs uppercase tracking-wide text-[var(--text-secondary)]"><tr>
          <th className="px-4 py-3">Age</th><th className="px-4 py-3">Contact</th><th className="px-4 py-3">Company</th>
          <th className="px-4 py-3">Reason</th><th className="px-4 py-3">Priority</th><th className="px-4 py-3">Assigned</th>
          <th className="px-4 py-3">Status</th><th className="px-4 py-3">SLA</th><th className="px-4 py-3">Last Message</th><th className="px-4 py-3">Actions</th>
        </tr></thead>
        <tbody className="divide-y divide-[var(--border)]">{visible.map(c => <tr key={c.customer_phone_normalized} className="hover:bg-[var(--surface-secondary)] align-top">
          <td className="whitespace-nowrap px-4 py-3 text-[var(--text-secondary)]">{c.handoff_created_at ? new Date(c.handoff_created_at).toLocaleString('en-ID') : '—'}</td>
          <td className="px-4 py-3 font-medium text-[var(--text)]">{c.customer_phone_normalized}</td>
          <td className="px-4 py-3 text-[var(--text-secondary)]">{c.customerName || '—'}</td>
          <td className="px-4 py-3 text-[var(--text-secondary)]">{c.handoff_reason || '—'}</td>
          <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${PRIORITY_STYLE[c.priority] || PRIORITY_STYLE.NORMAL}`}>{c.priority}</span></td>
          <td className="px-4 py-3 text-[var(--text-secondary)]">{c.assigned_role ? `${c.assigned_role}${c.assigned_team ? ` / ${c.assigned_team}` : ''}` : (c.assigned_team || 'Unassigned')}</td>
          <td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{c.state.replace(/_/g, ' ')}</span>{c.waitingState && <div className="mt-1 text-[10px] uppercase tracking-wide text-[var(--text-secondary)]">{c.waitingState.replace(/_/g, ' ')}</div>}</td>
          <td className="px-4 py-3">{c.slaStatus && <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${SLA_STYLE[c.slaStatus]}`}>{c.slaStatus}</span>}</td>
          <td className="px-4 py-3 max-w-xs truncate text-[var(--text-secondary)]" title={c.lastCustomerMessage ?? ''}>{c.lastCustomerMessage || '—'}</td>
          <td className="px-4 py-3">
            <div className="flex flex-col gap-1.5 min-w-[180px]">
              {(c.state === 'NEEDS_HUMAN' || c.state === 'HUMAN_ASSIGNED') && <div className="flex flex-wrap gap-1.5">
                <button disabled={busyPhone === c.customer_phone_normalized} onClick={() => act(c.customer_phone_normalized, 'assign-me')} className="rounded-md bg-[var(--surface-2)] px-2.5 py-1 text-xs font-medium hover:bg-[var(--surface-3)] disabled:opacity-50">Assign to Me</button>
                <button disabled={busyPhone === c.customer_phone_normalized} onClick={() => act(c.customer_phone_normalized, 'take-over')} className="rounded-md bg-[#6161ff] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#4f4fe0] disabled:opacity-50">Take Over</button>
              </div>}
              {c.state === 'HUMAN_ACTIVE' && <button disabled={busyPhone === c.customer_phone_normalized} onClick={() => act(c.customer_phone_normalized, 'return-to-auto')} className="self-start rounded-md bg-[var(--surface-2)] px-2.5 py-1 text-xs font-medium hover:bg-[var(--surface-3)] disabled:opacity-50">Return to VIA</button>}
              {(c.state === 'NEEDS_HUMAN' || c.state === 'HUMAN_ASSIGNED' || c.state === 'HUMAN_ACTIVE') && <div className="flex flex-wrap gap-1.5">
                <select disabled={busyPhone === c.customer_phone_normalized} defaultValue="" onChange={e => e.target.value && act(c.customer_phone_normalized, 'assign-team', { team: e.target.value })} className="rounded-md border border-[var(--border)] px-1.5 py-1 text-xs">
                  <option value="" disabled>Assign team…</option>
                  {TEAMS.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                </select>
                <button disabled={busyPhone === c.customer_phone_normalized} onClick={() => act(c.customer_phone_normalized, 'resolve')} className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">Resolve</button>
              </div>}
              {(c.state === 'RESOLVED' || c.state === 'CLOSED') && <button disabled={busyPhone === c.customer_phone_normalized} onClick={() => act(c.customer_phone_normalized, 'reopen')} className="self-start rounded-md bg-[var(--surface-2)] px-2.5 py-1 text-xs font-medium hover:bg-[var(--surface-3)] disabled:opacity-50">Reopen</button>}
              <div className="flex flex-wrap gap-1.5">
                <button onClick={() => runCopilot(c.customer_phone_normalized, 'summarize')} disabled={copilot[c.customer_phone_normalized]?.loading !== undefined} className="inline-flex items-center gap-1 rounded-md bg-[var(--surface-2)] px-2.5 py-1 text-xs font-medium hover:bg-[var(--surface-3)] disabled:opacity-50"><Sparkles size={12}/>Summarize</button>
                <button onClick={() => runCopilot(c.customer_phone_normalized, 'suggest-reply')} disabled={copilot[c.customer_phone_normalized]?.loading !== undefined} className="inline-flex items-center gap-1 rounded-md bg-[var(--surface-2)] px-2.5 py-1 text-xs font-medium hover:bg-[var(--surface-3)] disabled:opacity-50"><Sparkles size={12}/>Suggest Reply</button>
              </div>
              {copilot[c.customer_phone_normalized]?.summary && <p className="rounded-md bg-[var(--surface-2)] p-2 text-xs italic">{copilot[c.customer_phone_normalized]?.summary}</p>}
              {copilot[c.customer_phone_normalized]?.draft && <p className="rounded-md bg-[var(--surface-2)] p-2 text-xs italic">&ldquo;{copilot[c.customer_phone_normalized]?.draft}&rdquo;</p>}
            </div>
          </td>
        </tr>)}{!loading && !visible.length && <tr><td colSpan={10} className="px-4 py-12 text-center text-[var(--text-secondary)]"><Inbox className="mx-auto mb-2"/>Nothing in this view.</td></tr>}</tbody>
      </table></div>
    </section>
  </div></div>;
}
