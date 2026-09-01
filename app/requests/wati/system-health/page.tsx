'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, RotateCcw, CheckCircle2, AlertTriangle } from 'lucide-react';

interface CronRun { job_name: string; status: string; started_at: string; finished_at: string; error: string | null }
interface DeadJob { id: string; jobType: string; attemptCount: number; maxAttempts: number; lastError: string | null; payloadSummary: Record<string, string>; version: number; updatedAt: string }
interface HealthData { dependencies: Record<string, string>; scheduledJobs: CronRun[]; deadLetterQueue: DeadJob[] }
interface CostSummary {
  totalRequests: number; totalTokens: number; totalEstimatedCostUsd: number; costEstimateComplete: boolean;
  distinctConversations: number; costPerConversationUsd: number | null;
  byModel: Array<{ model: string; requests: number; tokens: number; estimatedCostUsd: number; costEstimateComplete: boolean }>;
  byTier: Array<{ tier: string; requests: number; tokens: number; estimatedCostUsd: number; costEstimateComplete: boolean }>;
}

const GRAINS = ['TODAY', 'YESTERDAY', 'LAST_7_DAYS', 'THIS_MONTH', 'LAST_MONTH'] as const;

export default function SystemHealthPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [cost, setCost] = useState<CostSummary | null>(null);
  const [grain, setGrain] = useState<(typeof GRAINS)[number]>('TODAY');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError('');
    try {
      const [healthRes, costRes] = await Promise.all([
        fetch('/api/requests/wati/system-health', { cache: 'no-store' }),
        fetch(`/api/requests/wati/system-health/cost?grain=${grain}`, { cache: 'no-store' }),
      ]);
      const healthBody = await healthRes.json();
      if (!healthRes.ok || !healthBody.success) throw new Error(healthBody.error || 'Unable to load system health.');
      setHealth(healthBody);
      const costBody = await costRes.json();
      if (costRes.ok && costBody.success) setCost(costBody);
      else setCost(null); // director-only; admin sees health without cost.
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [grain]);

  async function act(id: string, action: 'retry' | 'resolve', expectedVersion: number) {
    setBusyId(id);
    try {
      const response = await fetch(`/api/requests/wati/system-health/jobs/${id}/${action}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedVersion }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || `Failed to ${action}.`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusyId(null); }
  }

  return <div className="min-h-full bg-[var(--surface-secondary)] p-6 lg:p-8"><div className="mx-auto max-w-[1300px] space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">System Health</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Dependency configuration, scheduled-job outcomes, the background-job dead-letter queue, and (director only) model cost.</p></div>
      <button onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-lg bg-[#6161ff] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"><RefreshCw size={16} className={loading ? 'animate-spin' : ''}/>Refresh</button>
    </header>
    {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

    {health && <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <h2 className="mb-3 text-sm font-semibold text-[var(--text)]">Dependencies</h2>
      <div className="flex flex-wrap gap-2">
        {Object.entries(health.dependencies).map(([name, status]) => (
          <span key={name} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${status === 'configured' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
            {status === 'configured' ? <CheckCircle2 size={12}/> : <AlertTriangle size={12}/>} {name} · {status === 'configured' ? 'OK' : 'not configured'}
          </span>
        ))}
      </div>
    </section>}

    {health && <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <h2 className="border-b border-[var(--border)] px-4 py-3 text-sm font-semibold text-[var(--text)]">Scheduled jobs (most recent run)</h2>
      <div className="divide-y divide-[var(--border)]">
        {health.scheduledJobs.map(run => <div key={run.job_name} className="flex items-center justify-between px-4 py-2.5 text-sm">
          <span className="font-mono text-xs">{run.job_name}</span>
          <span className="flex items-center gap-3 text-xs text-[var(--text-secondary)]">
            <span className={run.status === 'success' ? 'text-emerald-700' : 'text-red-700'}>{run.status}</span>
            {new Date(run.finished_at).toLocaleString('en-ID')}
          </span>
        </div>)}
        {!health.scheduledJobs.length && <div className="px-4 py-8 text-center text-sm text-[var(--text-secondary)]">No scheduled-job runs recorded yet.</div>}
      </div>
    </section>}

    {health && <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <h2 className="border-b border-[var(--border)] px-4 py-3 text-sm font-semibold text-[var(--text)]">Dead-letter queue ({health.deadLetterQueue.length})</h2>
      <div className="divide-y divide-[var(--border)]">
        {health.deadLetterQueue.map(job => <div key={job.id} className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium text-[var(--text)]">{job.jobType}</span>
            <span className="text-xs text-[var(--text-secondary)]">{job.attemptCount}/{job.maxAttempts} attempts · {new Date(job.updatedAt).toLocaleString('en-ID')}</span>
          </div>
          {job.lastError && <p className="mt-1.5 text-xs text-red-700">{job.lastError}</p>}
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {Object.entries(job.payloadSummary).map(([k, v]) => <span key={k} className="rounded bg-[var(--surface-2)] px-2 py-0.5 text-xs">{k}: {v}</span>)}
          </div>
          <div className="mt-2.5 flex gap-1.5">
            <button disabled={busyId === job.id} onClick={() => act(job.id, 'retry', job.version)} className="inline-flex items-center gap-1 rounded-md bg-[var(--surface-2)] px-2.5 py-1 text-xs font-medium hover:bg-[var(--surface-3)] disabled:opacity-50"><RotateCcw size={12}/>Retry</button>
            <button disabled={busyId === job.id} onClick={() => act(job.id, 'resolve', job.version)} className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">Resolve</button>
          </div>
        </div>)}
        {!health.deadLetterQueue.length && <div className="px-4 py-8 text-center text-sm text-[var(--text-secondary)]">Nothing in the dead-letter queue.</div>}
      </div>
    </section>}

    <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
        <h2 className="text-sm font-semibold text-[var(--text)]">Model cost (director only)</h2>
        <div className="flex gap-1">
          {GRAINS.map(g => <button key={g} onClick={() => setGrain(g)} className={`rounded-md px-2.5 py-1 text-xs font-medium ${grain === g ? 'bg-[#eeeeff] text-[#4141cc]' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]'}`}>{g.replace(/_/g, ' ')}</button>)}
        </div>
      </div>
      {cost ? <div className="p-4">
        <div className="flex flex-wrap gap-4 text-sm">
          <div><div className="text-xs text-[var(--text-secondary)]">Requests</div><div className="font-medium tabular-nums">{cost.totalRequests}</div></div>
          <div><div className="text-xs text-[var(--text-secondary)]">Tokens</div><div className="font-medium tabular-nums">{cost.totalTokens.toLocaleString('en-US')}</div></div>
          <div><div className="text-xs text-[var(--text-secondary)]">Estimated cost</div><div className="font-medium tabular-nums">{cost.totalRequests === 0 ? '—' : `$${cost.totalEstimatedCostUsd.toFixed(4)}${cost.costEstimateComplete ? '' : ' (partial — pricing not configured for all models)'}`}</div></div>
          <div><div className="text-xs text-[var(--text-secondary)]">Conversations</div><div className="font-medium tabular-nums">{cost.distinctConversations}</div></div>
          <div><div className="text-xs text-[var(--text-secondary)]">Cost / conversation</div><div className="font-medium tabular-nums">{cost.costPerConversationUsd != null ? `$${cost.costPerConversationUsd.toFixed(4)}` : '—'}</div></div>
        </div>
        {cost.byModel.length > 0 && <div className="mt-4">
          <div className="mb-1.5 text-xs font-semibold text-[var(--text-secondary)]">By model</div>
          <div className="flex flex-wrap gap-2">{cost.byModel.map(m => <span key={m.model} className="rounded-md bg-[var(--surface-2)] px-2.5 py-1 text-xs">{m.model}: {m.requests} req, {m.tokens.toLocaleString('en-US')} tok{m.costEstimateComplete ? `, $${m.estimatedCostUsd.toFixed(4)}` : ''}</span>)}</div>
        </div>}
      </div> : <div className="px-4 py-8 text-center text-sm text-[var(--text-secondary)]">Cost data requires a director session and `JARVIS_MODEL_USAGE_LOG_ENABLED=true`.</div>}
    </section>
  </div></div>;
}
