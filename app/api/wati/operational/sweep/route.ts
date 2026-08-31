import { NextResponse } from 'next/server';
import { recordCronRun } from '@/lib/cron/runLog';
import { supabaseSelect } from '@/lib/supabase/rest';
import { resolveTimeGrain } from '@/lib/analytics/periods';
import { runOperationalDetection } from '@/lib/operationalIntelligence/detectionEngine';
import { isOperationalDetectionEnabled, isManagementAlertsEnabled } from '@/lib/customerIdentity/featureFlags';

export const maxDuration = 120;

const JOB_NAME = 'wati-operational-sweep';

interface CronRunRow { finished_at: string; summary: { includedDailyRules?: boolean } }

/**
 * Triggered periodically by an external cron-job.org scheduled job (see
 * middleware.ts CRON_PATHS), same pattern as the three existing sweeps.
 * Cheap/frequent rules (backlog, pending-action-at-risk, approved-not-
 * executed, workflow-stuck) run on every invocation; the daily-cadence rule
 * group (SLA/vendor/conversion/onboarding/data-quality trends) runs only
 * once per Jakarta calendar day, checked against cron_run_log rather than a
 * new scheduler (brief sections 67, 117).
 */
export async function POST() {
  const startedAt = new Date().toISOString();
  if (!isOperationalDetectionEnabled()) {
    await recordCronRun(JOB_NAME, 'success', startedAt, { skipped: 'OPERATIONAL_DETECTION_ENABLED is off' });
    return NextResponse.json({ success: true, skipped: true });
  }

  try {
    const today = resolveTimeGrain('TODAY');
    const recentRuns = await supabaseSelect<CronRunRow>('cron_run_log', `job_name=eq.${JOB_NAME}&select=finished_at,summary&order=finished_at.desc&limit=5`);
    const dailyAlreadyRanToday = recentRuns.some(r => r.summary?.includedDailyRules && new Date(r.finished_at) >= today.start && new Date(r.finished_at) < today.end);

    const result = await runOperationalDetection({ dryRun: false, notify: isManagementAlertsEnabled(), includeDailyRules: !dailyAlreadyRanToday });

    await recordCronRun(JOB_NAME, 'success', startedAt, {
      includedDailyRules: !dailyAlreadyRanToday,
      candidatesEvaluated: result.candidatesEvaluated, newFindings: result.newFindings, updatedFindings: result.updatedFindings,
      recurrences: result.recurrences, autoResolved: result.autoResolved, alertsSent: result.alertsSent,
    });
    return NextResponse.json({ success: true, ...result, candidates: undefined });
  } catch (err) {
    await recordCronRun(JOB_NAME, 'failed', startedAt, {}, err instanceof Error ? err.message : String(err));
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
