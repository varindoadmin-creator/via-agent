// ─── Durable background job queue ─────────────────────────────────────────────
// VIA Phase 13, brief sections 6, 9, 35: a Supabase-table-backed job queue and
// DLQ, not a new infrastructure dependency. Claiming a row uses the same
// optimistic-concurrency (`version`) pattern as lib/proactiveActions/store.ts
// and lib/operationalIntelligence/findingStore.ts — two workers racing the
// same due job can both attempt the claim PATCH, but only the one whose
// `version` still matches succeeds; the loser simply does not get that job
// this pass (it stays PENDING for the next claim attempt, never duplicated).
//
// Backoff math is the same shape as lib/zoho/retry.ts's fetchWithRetry
// (`baseDelayMs * 2**attempt + jitter`), just at a job-queue timescale
// (minutes, not milliseconds) rather than inventing new math.

import { supabaseSelect, supabaseInsert, supabasePatch, supabaseTable } from '../supabase/rest.ts';

const TABLE = 'background_jobs';

export type BackgroundJobStatus = 'PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'DEAD' | 'RESOLVED';

export interface BackgroundJob {
  id: string;
  organizationId: string;
  jobType: string;
  payload: Record<string, unknown>;
  status: BackgroundJobStatus;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: string;
  lastError: string | null;
  idempotencyKey: string;
  resolutionNote: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface JobRow {
  id: string; organization_id: string; job_type: string; payload: Record<string, unknown>;
  status: string; attempt_count: number; max_attempts: number; next_attempt_at: string;
  last_error: string | null; idempotency_key: string; resolution_note: string | null;
  version: number; created_at: string; updated_at: string;
}

function fromRow(row: JobRow): BackgroundJob {
  return {
    id: row.id, organizationId: row.organization_id, jobType: row.job_type, payload: row.payload ?? {},
    status: row.status as BackgroundJobStatus, attemptCount: row.attempt_count, maxAttempts: row.max_attempts,
    nextAttemptAt: row.next_attempt_at, lastError: row.last_error, idempotencyKey: row.idempotency_key,
    resolutionNote: row.resolution_note, version: row.version, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

/** A job handler throws this to signal the failure is not worth retrying (a validation/policy outcome, not a transient one) — the queue moves it straight to DEAD rather than spending its retry budget. */
export class PermanentJobFailure extends Error {}

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_BASE_DELAY_MS = 60_000; // 1 minute — a background job retry, not an inline HTTP retry.

/** Mirrors lib/zoho/retry.ts's exact backoff shape at a minutes-scale base delay. */
export function computeBackoffMs(attemptCount: number, baseDelayMs = DEFAULT_BASE_DELAY_MS): number {
  return baseDelayMs * 2 ** attemptCount + Math.random() * 1000;
}

export interface EnqueueJobInput {
  jobType: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  maxAttempts?: number;
}

/**
 * Insert-or-ignore-duplicate on `idempotency_key`, exactly like
 * lib/analytics/events.ts's recordAnalyticsEvent — a retried enqueue call
 * for the same logical job is a no-op, never a second row.
 */
export async function enqueueJob(input: EnqueueJobInput): Promise<void> {
  const db = supabaseTable(TABLE);
  const response = await fetch(`${db.url}?on_conflict=idempotency_key`, {
    method: 'POST',
    headers: { ...db.headers, Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify({
      job_type: input.jobType, payload: input.payload, idempotency_key: input.idempotencyKey,
      max_attempts: input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    }),
  });
  if (!response.ok) throw new Error(`Failed to enqueue job (${response.status}): ${await response.text()}`);
}

export async function getJob(id: string): Promise<BackgroundJob | null> {
  const rows = await supabaseSelect<JobRow>(TABLE, `id=eq.${encodeURIComponent(id)}&select=*`);
  return rows[0] ? fromRow(rows[0]) : null;
}

/**
 * Claims up to `limit` due PENDING jobs of `jobType`. Each candidate is
 * claimed with an individual version+status-filtered PATCH — under a race
 * between two sweep invocations, only one succeeds per row; the other simply
 * does not receive that job this pass (never a duplicate claim).
 */
export async function claimNextJobs(jobType: string, limit: number): Promise<BackgroundJob[]> {
  const nowIso = new Date().toISOString();
  const candidates = await supabaseSelect<JobRow>(
    TABLE,
    `job_type=eq.${encodeURIComponent(jobType)}&status=eq.PENDING&next_attempt_at=lte.${nowIso}&select=*&order=next_attempt_at.asc&limit=${limit}`,
  );

  const claimed: BackgroundJob[] = [];
  for (const row of candidates) {
    const rows = await supabasePatch<JobRow>(
      TABLE,
      `id=eq.${row.id}&version=eq.${row.version}&status=eq.PENDING`,
      { status: 'PROCESSING', version: row.version + 1, updated_at: new Date().toISOString() },
    );
    if (rows[0]) claimed.push(fromRow(rows[0]));
  }
  return claimed;
}

export async function completeJob(id: string, expectedVersion: number): Promise<void> {
  const rows = await supabasePatch<JobRow>(TABLE, `id=eq.${encodeURIComponent(id)}&version=eq.${expectedVersion}`, {
    status: 'SUCCEEDED', version: expectedVersion + 1, updated_at: new Date().toISOString(),
  });
  if (!rows[0]) throw new Error('Job was modified concurrently while completing.');
}

export interface FailJobOptions {
  permanent?: boolean;
}

/**
 * Retryable failure schedules the next attempt with exponential backoff; a
 * permanent failure (or exhausting max_attempts) moves straight to DEAD —
 * the job stops retrying and becomes visible in the DLQ (lib/jobs/deadLetter.ts)
 * rather than looping forever or being silently dropped.
 */
export async function failJob(id: string, expectedVersion: number, error: string, options: FailJobOptions = {}): Promise<BackgroundJob> {
  const job = await getJob(id);
  if (!job) throw new Error('Job not found.');
  const nextAttemptCount = job.attemptCount + 1;
  const exhausted = options.permanent || nextAttemptCount >= job.maxAttempts;
  const patch: Record<string, unknown> = {
    attempt_count: nextAttemptCount, last_error: error.slice(0, 2000),
    status: exhausted ? 'DEAD' : 'PENDING',
    next_attempt_at: exhausted ? job.nextAttemptAt : new Date(Date.now() + computeBackoffMs(nextAttemptCount)).toISOString(),
    version: expectedVersion + 1, updated_at: new Date().toISOString(),
  };
  const rows = await supabasePatch<JobRow>(TABLE, `id=eq.${encodeURIComponent(id)}&version=eq.${expectedVersion}`, patch);
  if (!rows[0]) throw new Error('Job was modified concurrently while failing.');
  const failed = fromRow(rows[0]);
  console.error('[jobs.queue]', JSON.stringify({ event: exhausted ? 'job.dead' : 'job.retry_scheduled', jobId: id, jobType: job.jobType, attemptCount: nextAttemptCount, error: error.slice(0, 300) }));
  return failed;
}

export async function countDeadJobs(): Promise<number> {
  const rows = await supabaseSelect<{ id: string }>(TABLE, 'status=eq.DEAD&select=id&limit=1000');
  return rows.length;
}
