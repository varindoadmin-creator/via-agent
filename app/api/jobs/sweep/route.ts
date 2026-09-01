import { NextResponse } from 'next/server';
import { recordCronRun } from '@/lib/cron/runLog';
import { sendMail } from '@/lib/email/sendMail';
import { claimNextJobs, completeJob, failJob, countDeadJobs, PermanentJobFailure, type BackgroundJob } from '@/lib/jobs/queue';
import { sendProactiveOutreach } from '@/lib/proactiveActions/sendOutreach';
import { retrySalespersonAssignment } from '@/lib/salespersonMap/sync';

export const maxDuration = 60;

const JOB_NAME = 'background-jobs-sweep';
const ALERT_TO = process.env.VIA_ALERT_EMAIL || 'varindo.admin@gmail.com';
const DEAD_ALERT_THRESHOLD = Math.max(1, Number(process.env.JOBS_DEAD_ALERT_THRESHOLD) || 5);
const CLAIM_LIMIT_PER_TYPE = 20;

/**
 * VIA Phase 13, brief sections 6, 9, 35: the one sweep route for every
 * background_jobs job type, same cron-sweep pattern (flag-free — this queue
 * has no master kill switch because it only ever holds retries for writes
 * that already passed their own eligibility/policy checks once) as every
 * other WATI sweep route under app/api/wati. Each handler either resolves
 * (job done) or throws — a `PermanentJobFailure` skips straight to DEAD, any
 * other thrown error is treated as retryable with exponential backoff.
 */
const JOB_HANDLERS: Record<string, (payload: Record<string, unknown>) => Promise<void>> = {
  wati_send_retry: async (payload) => {
    const actionId = String(payload.actionId || '');
    if (!actionId) throw new PermanentJobFailure('Missing actionId in job payload.');
    const outcome = await sendProactiveOutreach(actionId);
    if (outcome.result === 'SENT') return;
    if (outcome.result === 'SKIPPED' && outcome.reason === 'DUPLICATE_PREVENTED') return; // already sent by another path
    if (outcome.result === 'FAILED') {
      // sendOutreach.ts already called markFailed with a policy/validation
      // reason (SUPPRESSED, CUSTOMER_INACTIVE, NO_PHONE, DISCLOSURE_BLOCKED,
      // NO_TEMPLATE) — brief section 5: never retry a policy denial.
      throw new PermanentJobFailure(`Action ${actionId} failed permanently: ${outcome.reason}`);
    }
    // Still SKIPPED for a transient reason (HUMAN_ACTIVE, COOLDOWN, WATI 'disabled'/'failed') — retryable.
    throw new Error(`Action ${actionId} still not sendable: ${outcome.reason}`);
  },
  salesperson_assign_retry: async (payload) => {
    await retrySalespersonAssignment(payload as { documentType: 'sales_order' | 'invoice'; documentId: string; salespersonId: string; salespersonName: string });
  },
};

async function processJob(job: BackgroundJob): Promise<'SUCCEEDED' | 'RETRY' | 'DEAD'> {
  const handler = JOB_HANDLERS[job.jobType];
  if (!handler) {
    await failJob(job.id, job.version, `No handler registered for job type "${job.jobType}".`, { permanent: true });
    return 'DEAD';
  }
  try {
    await handler(job.payload);
    await completeJob(job.id, job.version);
    return 'SUCCEEDED';
  } catch (error) {
    const permanent = error instanceof PermanentJobFailure;
    const failed = await failJob(job.id, job.version, error instanceof Error ? error.message : String(error), { permanent });
    return failed.status === 'DEAD' ? 'DEAD' : 'RETRY';
  }
}

export async function POST() {
  const startedAt = new Date().toISOString();
  try {
    const jobTypes = Object.keys(JOB_HANDLERS);
    let succeeded = 0, retried = 0, dead = 0;
    for (const jobType of jobTypes) {
      const jobs = await claimNextJobs(jobType, CLAIM_LIMIT_PER_TYPE);
      for (const job of jobs) {
        const outcome = await processJob(job);
        if (outcome === 'SUCCEEDED') succeeded++;
        else if (outcome === 'RETRY') retried++;
        else dead++;
      }
    }

    const deadTotal = await countDeadJobs();
    let emailed = false;
    if (deadTotal >= DEAD_ALERT_THRESHOLD) {
      await sendMail({
        to: ALERT_TO,
        subject: `VIA Alert: ${deadTotal} background job(s) in the dead-letter queue`,
        html: `<p>${deadTotal} background job(s) have exhausted their retry budget and require manual attention.</p>
          <p style="margin-top:16px"><a href="https://via-601025884976.asia-southeast2.run.app/requests/wati/system-health">Open System Health in VIA →</a></p>`,
      });
      emailed = true;
    }

    await recordCronRun(JOB_NAME, 'success', startedAt, { succeeded, retried, dead, deadTotal, emailed });
    return NextResponse.json({ success: true, succeeded, retried, dead, deadTotal, emailed });
  } catch (err) {
    await recordCronRun(JOB_NAME, 'failed', startedAt, {}, err instanceof Error ? err.message : String(err));
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
