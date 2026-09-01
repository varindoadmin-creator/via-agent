import { NextResponse } from 'next/server';
import { recordCronRun } from '@/lib/cron/runLog';
import { supabaseSelect } from '@/lib/supabase/rest';
import { resolveTimeGrain } from '@/lib/analytics/periods';
import { runProactiveDetection } from '@/lib/proactiveActions/detectionEngine';
import { isProactiveActionsEnabled } from '@/lib/customerIdentity/featureFlags';

export const maxDuration = 120;

const JOB_NAME = 'wati-proactive-sweep';

interface CronRunRow { finished_at: string; summary: { includedExpensiveRules?: boolean } }

/**
 * Triggered periodically by an external cron-job.org scheduled job (see
 * middleware.ts CRON_PATHS), same pattern as the other WATI sweeps. Cheap,
 * Supabase-only detectors (quotation/order-intent/sample/service-recovery)
 * run on every invocation; the Zoho-cost detectors (reorder, dormant) run at
 * most once per Jakarta calendar day, gated against cron_run_log the same
 * way Phase 10's operational sweep gates its daily rule group.
 */
export async function POST() {
  const startedAt = new Date().toISOString();
  if (!isProactiveActionsEnabled()) {
    await recordCronRun(JOB_NAME, 'success', startedAt, { skipped: 'PROACTIVE_ACTIONS_ENABLED is off' });
    return NextResponse.json({ success: true, skipped: true });
  }

  try {
    const today = resolveTimeGrain('TODAY');
    const recentRuns = await supabaseSelect<CronRunRow>('cron_run_log', `job_name=eq.${JOB_NAME}&select=finished_at,summary&order=finished_at.desc&limit=5`);
    const expensiveAlreadyRanToday = recentRuns.some(r => r.summary?.includedExpensiveRules && new Date(r.finished_at) >= today.start && new Date(r.finished_at) < today.end);

    const result = await runProactiveDetection({ autoSend: true, includeExpensiveRules: !expensiveAlreadyRanToday });

    await recordCronRun(JOB_NAME, 'success', startedAt, { includedExpensiveRules: !expensiveAlreadyRanToday, ...result });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    await recordCronRun(JOB_NAME, 'failed', startedAt, {}, err instanceof Error ? err.message : String(err));
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
