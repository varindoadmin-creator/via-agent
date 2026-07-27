// Completion heartbeat for externally scheduled jobs.
// Logging is deliberately best-effort: a Supabase outage must not turn a
// completed Zoho operation into a reported cron failure.

export type CronRunStatus = 'success' | 'failed';

export async function recordCronRun(
  jobName: string,
  status: CronRunStatus,
  startedAt: string,
  summary: Record<string, unknown> = {},
  error: string | null = null,
): Promise<void> {
  const base = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
  if (!base || !key) return;

  try {
    const res = await fetch(`${base}/rest/v1/cron_run_log`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        job_name: jobName,
        status,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        summary,
        error,
      }),
    });
    if (!res.ok) {
      console.error(`[Cron:${jobName}] heartbeat failed: Supabase ${res.status}`);
    }
  } catch (err) {
    console.error(`[Cron:${jobName}] heartbeat failed:`, err);
  }
}
