// ─── Dead-letter queue admin actions ──────────────────────────────────────────
// VIA Phase 13, brief section 35: an admin view over DEAD background_jobs
// rows — retry (reset to PENDING, attempt_count 0) or resolve (permanently
// closed without retrying). Never discards a failed customer workflow
// silently — a DEAD job stays visible until an operator acts on it.

import { supabaseSelect, supabasePatch } from '../supabase/rest.ts';
import type { BackgroundJob, BackgroundJobStatus } from './queue.ts';

const TABLE = 'background_jobs';

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

/** Truncated, structurally safe summary — never dumps a raw payload that might carry a phone number or customer name unlabeled. */
export function safePayloadSummary(job: BackgroundJob): Record<string, string> {
  const summary: Record<string, string> = {};
  for (const [key, value] of Object.entries(job.payload)) {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    summary[key] = text.length > 60 ? `${text.slice(0, 60)}…` : text;
  }
  return summary;
}

export async function listDeadJobs(): Promise<BackgroundJob[]> {
  const rows = await supabaseSelect<JobRow>(TABLE, 'status=eq.DEAD&select=*&order=updated_at.desc&limit=200');
  return rows.map(fromRow);
}

export async function retryDeadJob(id: string, expectedVersion: number): Promise<BackgroundJob> {
  const rows = await supabasePatch<JobRow>(TABLE, `id=eq.${encodeURIComponent(id)}&version=eq.${expectedVersion}&status=eq.DEAD`, {
    status: 'PENDING', attempt_count: 0, last_error: null, next_attempt_at: new Date().toISOString(),
    version: expectedVersion + 1, updated_at: new Date().toISOString(),
  });
  if (!rows[0]) throw new Error('Job was modified concurrently, or is no longer DEAD.');
  console.info('[jobs.deadLetter]', JSON.stringify({ event: 'job.retried_from_dlq', jobId: id }));
  return fromRow(rows[0]);
}

export async function resolveDeadJob(id: string, expectedVersion: number, resolutionNote: string): Promise<BackgroundJob> {
  const rows = await supabasePatch<JobRow>(TABLE, `id=eq.${encodeURIComponent(id)}&version=eq.${expectedVersion}&status=eq.DEAD`, {
    status: 'RESOLVED', resolution_note: resolutionNote, version: expectedVersion + 1, updated_at: new Date().toISOString(),
  });
  if (!rows[0]) throw new Error('Job was modified concurrently, or is no longer DEAD.');
  console.info('[jobs.deadLetter]', JSON.stringify({ event: 'job.resolved', jobId: id }));
  return fromRow(rows[0]);
}
