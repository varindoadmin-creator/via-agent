import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth';
import { listDeadJobs, safePayloadSummary } from '@/lib/jobs/deadLetter';
import { supabaseSelect } from '@/lib/supabase/rest';

export const dynamic = 'force-dynamic';

interface CronRunRow { job_name: string; status: string; started_at: string; finished_at: string; error: string | null }

// GET /api/requests/wati/system-health — brief section 47's admin health
// dashboard: dependency configuration readiness (reuses the same checks
// /api/jarvis/health exposes), recent scheduled-job outcomes from
// cron_run_log, and the background-jobs dead-letter queue.
export async function GET(req: NextRequest) {
  const role = await verifySessionToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!role) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  try {
    const modelConfigured = Boolean(process.env.OPENAI_API_KEY);
    const zohoConfigured = Boolean(process.env.ZOHO_CLIENT_ID && process.env.ZOHO_CLIENT_SECRET && process.env.ZOHO_REFRESH_TOKEN && process.env.ZOHO_ORGANIZATION_ID);
    const supabaseConfigured = Boolean((process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY));
    const watiConfigured = Boolean(process.env.WATI_API_TOKEN && process.env.WATI_API_BASE_URL);

    const [deadJobs, recentRuns] = await Promise.all([
      listDeadJobs(),
      supabaseSelect<CronRunRow>('cron_run_log', 'select=job_name,status,started_at,finished_at,error&order=finished_at.desc&limit=50'),
    ]);

    const latestByJob = new Map<string, CronRunRow>();
    for (const run of recentRuns) if (!latestByJob.has(run.job_name)) latestByJob.set(run.job_name, run);

    return NextResponse.json({
      success: true,
      dependencies: {
        model: modelConfigured ? 'configured' : 'missing_config',
        zoho: zohoConfigured ? 'configured' : 'missing_config',
        supabase: supabaseConfigured ? 'configured' : 'missing_config',
        wati: watiConfigured ? 'configured' : 'missing_config',
      },
      scheduledJobs: Array.from(latestByJob.values()),
      deadLetterQueue: deadJobs.map(job => ({
        id: job.id, jobType: job.jobType, attemptCount: job.attemptCount, maxAttempts: job.maxAttempts,
        lastError: job.lastError, payloadSummary: safePayloadSummary(job), version: job.version, updatedAt: job.updatedAt,
      })),
    });
  } catch (error) {
    console.error('[SystemHealth]', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ success: false, error: 'Unable to load system health.' }, { status: 500 });
  }
}
