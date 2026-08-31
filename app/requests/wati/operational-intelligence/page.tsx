'use client';

import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, AlertTriangle, TrendingUp, Inbox } from 'lucide-react';

type Severity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
type FindingStatus = 'OPEN' | 'ACKNOWLEDGED' | 'ACTION_PLANNED' | 'IN_PROGRESS' | 'RESOLVED' | 'DISMISSED' | 'EXPIRED';

interface Evidence { metricKey: string; label: string; currentValue: number; baselineValue?: number | null; comparisonPeriod?: string; sampleSize?: number }
interface Finding {
  id: string; category: string; type: string; severity: Severity; urgency: Severity; status: FindingStatus;
  title: string; evidence: Evidence[]; confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  recommendedActionType: string | null; recommendationText: string | null;
  assignedRole: string | null; assignedTeam: string | null;
  detectedAt: string; version: number; recurrenceCount: number; priorityScore?: number;
}

const VIEWS = ['Needs Attention', 'Critical', 'High Priority', 'Customer Service', 'Stock & Vendor', 'Pricing', 'Data Quality', 'System Reliability', 'In Progress', 'Resolved', 'Dismissed'] as const;
type View = (typeof VIEWS)[number];

const SEVERITY_STYLE: Record<Severity, string> = {
  INFO: 'bg-slate-100 text-slate-600', LOW: 'bg-slate-100 text-slate-600',
  MEDIUM: 'bg-amber-100 text-amber-700', HIGH: 'bg-orange-100 text-orange-700', CRITICAL: 'bg-red-100 text-red-700',
};

function matchesView(f: Finding, view: View): boolean {
  const active = f.status !== 'RESOLVED' && f.status !== 'DISMISSED' && f.status !== 'EXPIRED';
  switch (view) {
    case 'Needs Attention': return active && (f.status === 'OPEN' || f.status === 'ACKNOWLEDGED');
    case 'Critical': return active && f.severity === 'CRITICAL';
    case 'High Priority': return active && f.severity === 'HIGH';
    case 'Customer Service': return active && f.category === 'CUSTOMER_SERVICE';
    case 'Stock & Vendor': return active && (f.category === 'STOCK' || f.category === 'VENDOR' || f.category === 'PRODUCT');
    case 'Pricing': return active && f.category === 'PRICING';
    case 'Data Quality': return active && f.category === 'DATA_QUALITY';
    case 'System Reliability': return active && f.category === 'SYSTEM_RELIABILITY';
    case 'In Progress': return f.status === 'ACTION_PLANNED' || f.status === 'IN_PROGRESS';
    case 'Resolved': return f.status === 'RESOLVED';
    case 'Dismissed': return f.status === 'DISMISSED';
  }
}

export default function OperationalIntelligencePage() {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<View>('Needs Attention');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [backtest, setBacktest] = useState<{ running: boolean; result?: { candidatesEvaluated: number; byType: Array<{ type: string; category: string; magnitude: number; confidence: string; title: string }> } }>({ running: false });

  async function load() {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/requests/wati/operational-findings?status=OPEN,ACKNOWLEDGED,ACTION_PLANNED,IN_PROGRESS,RESOLVED,DISMISSED&ranked=true', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || 'Unable to load findings.');
      setFindings(body.findings);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  const visible = useMemo(() => findings.filter(f => matchesView(f, view)), [findings, view]);
  const viewCount = (v: View) => findings.filter(f => matchesView(f, v)).length;

  async function act(id: string, action: string, body?: Record<string, unknown>) {
    setBusyId(id);
    try {
      const response = await fetch(`/api/requests/wati/operational-findings/${id}/${action}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || `Failed to ${action}.`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusyId(null); }
  }

  async function runBacktest() {
    setBacktest({ running: true });
    try {
      const response = await fetch('/api/requests/wati/operational-findings/backtest', { method: 'POST' });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || 'Backtest failed.');
      setBacktest({ running: false, result: body });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBacktest({ running: false });
    }
  }

  return <div className="min-h-full bg-[var(--surface-secondary)] p-6 lg:p-8"><div className="mx-auto max-w-[1500px] space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">Operational Intelligence</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Findings Jarvis detected deterministically from governed metrics — not every metric, only what deserves attention.</p></div>
      <div className="flex items-center gap-2">
        <button onClick={runBacktest} disabled={backtest.running} className="inline-flex items-center gap-2 rounded-lg bg-[var(--surface-2)] px-4 py-2 text-sm font-medium disabled:opacity-60"><TrendingUp size={16}/>Backtest</button>
        <button onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-lg bg-[#6161ff] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"><RefreshCw size={16} className={loading ? 'animate-spin' : ''}/>Refresh</button>
      </div>
    </header>
    {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    {backtest.result && <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">
      <div className="mb-2 font-medium">Backtest: {backtest.result.candidatesEvaluated} candidate(s) against current data (not persisted, no alerts sent)</div>
      {backtest.result.byType.length === 0 ? <p className="text-[var(--text-secondary)]">No rule currently breaches its threshold.</p> :
        <ul className="space-y-1">{backtest.result.byType.map((c, i) => <li key={i} className="text-[var(--text-secondary)]">{c.title} — <span className="font-medium">{c.category}</span>, magnitude {(c.magnitude * 100).toFixed(0)}%, confidence {c.confidence}</li>)}</ul>}
    </div>}
    <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-4 py-3">
        {VIEWS.map(v => <button key={v} onClick={() => setView(v)} className={`rounded-md px-3 py-1.5 text-sm font-medium ${view === v ? 'bg-[#eeeeff] text-[#4141cc]' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]'}`}>{v} <span className="text-xs opacity-60">({viewCount(v)})</span></button>)}
      </div>
      <div className="divide-y divide-[var(--border)]">
        {visible.map(f => <div key={f.id} className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className={`mt-0.5 rounded-full px-2.5 py-1 text-xs font-semibold ${SEVERITY_STYLE[f.severity]}`}>{f.severity}</span>
              <div>
                <div className="font-medium text-[var(--text)]">{f.title}</div>
                <div className="mt-0.5 text-xs text-[var(--text-secondary)]">{f.category.replace(/_/g, ' ')} · detected {new Date(f.detectedAt).toLocaleString('en-ID')}{f.recurrenceCount > 0 && ` · recurred ${f.recurrenceCount}x`}</div>
              </div>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{f.status.replace(/_/g, ' ')}</span>
          </div>
          {f.evidence.length > 0 && <div className="mt-3 flex flex-wrap gap-2">
            {f.evidence.map((e, i) => <span key={i} className="rounded-md bg-[var(--surface-2)] px-2.5 py-1 text-xs">{e.label}: <span className="font-medium tabular-nums">{typeof e.currentValue === 'number' && e.currentValue < 1 && e.currentValue > 0 ? `${(e.currentValue * 100).toFixed(0)}%` : e.currentValue}</span>{e.baselineValue != null && <span className="text-[var(--text-secondary)]"> (was {e.baselineValue < 1 && e.baselineValue > 0 ? `${(e.baselineValue * 100).toFixed(0)}%` : e.baselineValue})</span>}</span>)}
          </div>}
          {f.recommendationText && <p className="mt-3 rounded-md bg-[var(--surface-2)] p-2.5 text-sm italic text-[var(--text-secondary)]"><AlertTriangle size={12} className="mr-1 inline"/>{f.recommendationText} <span className="text-xs not-italic">(confidence: {f.confidence})</span></p>}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {(f.status === 'OPEN') && <button disabled={busyId === f.id} onClick={() => act(f.id, 'acknowledge', { expectedVersion: f.version })} className="rounded-md bg-[var(--surface-2)] px-2.5 py-1 text-xs font-medium hover:bg-[var(--surface-3)] disabled:opacity-50">Acknowledge</button>}
            {(f.status !== 'RESOLVED' && f.status !== 'DISMISSED') && <>
              <button disabled={busyId === f.id} onClick={() => { const description = prompt('Action plan description:'); if (description) act(f.id, 'actions', { expectedVersion: f.version, description }); }} className="rounded-md bg-[var(--surface-2)] px-2.5 py-1 text-xs font-medium hover:bg-[var(--surface-3)] disabled:opacity-50">Create Action Plan</button>
              <button disabled={busyId === f.id} onClick={() => act(f.id, 'resolve', { expectedVersion: f.version })} className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">Resolve</button>
              <button disabled={busyId === f.id} onClick={() => { const reason = prompt('Dismissal reason (KNOWN_ISSUE, NOT_MATERIAL, FALSE_POSITIVE, EXPECTED_BUSINESS_PATTERN, ALREADY_ADDRESSED, OTHER):', 'NOT_MATERIAL'); if (reason) act(f.id, 'dismiss', { expectedVersion: f.version, reason }); }} className="rounded-md bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50">Dismiss</button>
            </>}
          </div>
        </div>)}
        {!loading && !visible.length && <div className="px-4 py-12 text-center text-[var(--text-secondary)]"><Inbox className="mx-auto mb-2"/>Nothing in this view.</div>}
      </div>
    </section>
  </div></div>;
}
