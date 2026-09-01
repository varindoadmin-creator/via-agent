// ─── Management experiment store ──────────────────────────────────────────────
// VIA Phase 12, brief section 36: controlled experiment records. The
// non-negotiable this file enforces in code, not just documentation: a
// conclusion is never set below MIN_EXPERIMENT_SAMPLE_SIZE on either side —
// the row is marked INSUFFICIENT_DATA instead of guessing IMPROVED/WORSENED
// from too little data (same threshold and reasoning as
// lib/analytics/periods.ts's SMALL_SAMPLE_THRESHOLD).

import { supabaseSelect, supabaseInsert, supabasePatch } from '../supabase/rest.ts';

const TABLE = 'management_experiments';
export const MIN_EXPERIMENT_SAMPLE_SIZE = 10;
/** Same "under 5% is noise" convention lib/analytics/bottleneck.ts already uses. */
const MATERIAL_CHANGE_THRESHOLD = 0.05;

export type ExperimentStatus = 'RUNNING' | 'INSUFFICIENT_DATA' | 'CONCLUDED';
export type ExperimentConclusion = 'IMPROVED' | 'NO_CHANGE' | 'WORSENED';

export interface ManagementExperiment {
  id: string;
  name: string;
  hypothesis: string;
  metricId: string;
  startedAt: string;
  endedAt: string | null;
  beforeValue: number | null;
  beforeSampleSize: number;
  afterValue: number | null;
  afterSampleSize: number;
  status: ExperimentStatus;
  conclusion: ExperimentConclusion | null;
  conclusionNotes: string | null;
  createdBy: 'admin' | 'director';
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface ExperimentRow {
  id: string; name: string; hypothesis: string; metric_id: string;
  started_at: string; ended_at: string | null;
  before_value: number | null; before_sample_size: number; after_value: number | null; after_sample_size: number;
  status: string; conclusion: string | null; conclusion_notes: string | null;
  created_by: string; version: number; created_at: string; updated_at: string;
}

function fromRow(row: ExperimentRow): ManagementExperiment {
  return {
    id: row.id, name: row.name, hypothesis: row.hypothesis, metricId: row.metric_id,
    startedAt: row.started_at, endedAt: row.ended_at,
    beforeValue: row.before_value, beforeSampleSize: row.before_sample_size,
    afterValue: row.after_value, afterSampleSize: row.after_sample_size,
    status: row.status as ExperimentStatus, conclusion: row.conclusion as ExperimentConclusion | null,
    conclusionNotes: row.conclusion_notes,
    createdBy: row.created_by as 'admin' | 'director', version: row.version,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export interface CreateExperimentInput {
  name: string; hypothesis: string; metricId: string;
  beforeValue: number; beforeSampleSize: number;
  createdBy: 'admin' | 'director';
}

export async function createExperiment(input: CreateExperimentInput): Promise<ManagementExperiment> {
  const row = await supabaseInsert<ExperimentRow>(TABLE, {
    name: input.name, hypothesis: input.hypothesis, metric_id: input.metricId,
    before_value: input.beforeValue, before_sample_size: input.beforeSampleSize, created_by: input.createdBy,
  });
  if (!row) throw new Error('Experiment was not created.');
  return fromRow(row);
}

export async function getExperiment(id: string): Promise<ManagementExperiment | null> {
  const rows = await supabaseSelect<ExperimentRow>(TABLE, `id=eq.${encodeURIComponent(id)}&select=*`);
  return rows[0] ? fromRow(rows[0]) : null;
}

export async function listExperiments(status?: ExperimentStatus): Promise<ManagementExperiment[]> {
  const parts = ['select=*', 'order=started_at.desc', 'limit=200'];
  if (status) parts.push(`status=eq.${status}`);
  const rows = await supabaseSelect<ExperimentRow>(TABLE, parts.join('&'));
  return rows.map(fromRow);
}

function classifyConclusion(before: number, after: number): ExperimentConclusion {
  if (before === 0) return after === 0 ? 'NO_CHANGE' : 'IMPROVED';
  const percentChange = (after - before) / before;
  if (Math.abs(percentChange) < MATERIAL_CHANGE_THRESHOLD) return 'NO_CHANGE';
  return percentChange > 0 ? 'IMPROVED' : 'WORSENED';
}

export interface RecordExperimentResultInput {
  afterValue: number;
  afterSampleSize: number;
  /** Whether a higher metric value is the desired direction — e.g. true for conversion rate, false for resolution time. Determines IMPROVED vs WORSENED labeling only; the underlying percent-change math is unaffected. */
  higherIsBetter: boolean;
}

/**
 * Section 36's non-negotiable: never auto-declares success/failure without
 * enough data on both sides. Below MIN_EXPERIMENT_SAMPLE_SIZE on either
 * side, the experiment is marked INSUFFICIENT_DATA with no conclusion.
 */
export async function recordExperimentResult(id: string, expectedVersion: number, input: RecordExperimentResultInput): Promise<ManagementExperiment> {
  const existing = await getExperiment(id);
  if (!existing) throw new Error('Experiment not found.');

  const insufficientData = existing.beforeSampleSize < MIN_EXPERIMENT_SAMPLE_SIZE || input.afterSampleSize < MIN_EXPERIMENT_SAMPLE_SIZE;
  const rawConclusion = insufficientData || existing.beforeValue === null ? null : classifyConclusion(existing.beforeValue, input.afterValue);
  const conclusion = rawConclusion && !input.higherIsBetter
    ? (rawConclusion === 'IMPROVED' ? 'WORSENED' : rawConclusion === 'WORSENED' ? 'IMPROVED' : 'NO_CHANGE')
    : rawConclusion;

  const rows = await supabasePatch<ExperimentRow>(TABLE, `id=eq.${encodeURIComponent(id)}&version=eq.${expectedVersion}`, {
    after_value: input.afterValue, after_sample_size: input.afterSampleSize, ended_at: new Date().toISOString(),
    status: insufficientData ? 'INSUFFICIENT_DATA' : 'CONCLUDED', conclusion,
    conclusion_notes: insufficientData ? `Sample size below the minimum of ${MIN_EXPERIMENT_SAMPLE_SIZE} on ${existing.beforeSampleSize < MIN_EXPERIMENT_SAMPLE_SIZE ? 'the before' : 'the after'} side — no conclusion drawn.` : null,
    version: expectedVersion + 1, updated_at: new Date().toISOString(),
  });
  if (!rows[0]) throw new Error('Experiment was modified concurrently; reload before retrying.');
  return fromRow(rows[0]);
}
