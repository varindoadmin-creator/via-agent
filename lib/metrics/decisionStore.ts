// ─── Decision record store ─────────────────────────────────────────────────────
// VIA Phase 12, brief section 35: durable record of a management decision
// made in response to a finding/brief, so an outcome can be compared later.
// Mirrors lib/operationalIntelligence/findingStore.ts's versioned-transition
// idiom (optimistic concurrency via `version`), scaled down — decisions are
// created once by an explicit human action, never detected/re-detected, so
// there is no dedupe-key upsert path here.

import { supabaseSelect, supabaseInsert, supabasePatch } from '../supabase/rest.ts';

const TABLE = 'management_decisions';

export type LinkedFindingType = 'OPERATIONAL_FINDING' | 'PROACTIVE_ACTION' | 'OTHER';
export type DecisionStatus = 'PENDING_REVIEW' | 'REVIEWED';

export interface DecisionRecord {
  id: string;
  organizationId: string;
  decision: string;
  rationale: string;
  linkedFindingType: LinkedFindingType | null;
  linkedFindingId: string | null;
  linkedFindingDescription: string | null;
  decidedBy: 'admin' | 'director';
  decidedAt: string;
  expectedOutcome: string;
  reviewDate: string;
  status: DecisionStatus;
  actualOutcome: string | null;
  reviewedBy: 'admin' | 'director' | null;
  reviewedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface DecisionRow {
  id: string; organization_id: string; decision: string; rationale: string;
  linked_finding_type: string | null; linked_finding_id: string | null; linked_finding_description: string | null;
  decided_by: string; decided_at: string; expected_outcome: string; review_date: string;
  status: string; actual_outcome: string | null; reviewed_by: string | null; reviewed_at: string | null;
  version: number; created_at: string; updated_at: string;
}

function fromRow(row: DecisionRow): DecisionRecord {
  return {
    id: row.id, organizationId: row.organization_id, decision: row.decision, rationale: row.rationale,
    linkedFindingType: row.linked_finding_type as LinkedFindingType | null, linkedFindingId: row.linked_finding_id,
    linkedFindingDescription: row.linked_finding_description,
    decidedBy: row.decided_by as 'admin' | 'director', decidedAt: row.decided_at,
    expectedOutcome: row.expected_outcome, reviewDate: row.review_date,
    status: row.status as DecisionStatus, actualOutcome: row.actual_outcome,
    reviewedBy: row.reviewed_by as 'admin' | 'director' | null, reviewedAt: row.reviewed_at,
    version: row.version, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export interface RecordDecisionInput {
  decision: string;
  rationale: string;
  linkedFindingType?: LinkedFindingType;
  linkedFindingId?: string;
  linkedFindingDescription?: string;
  decidedBy: 'admin' | 'director';
  expectedOutcome: string;
  reviewDate: string; // YYYY-MM-DD
}

export async function recordDecision(input: RecordDecisionInput): Promise<DecisionRecord> {
  const row = await supabaseInsert<DecisionRow>(TABLE, {
    decision: input.decision, rationale: input.rationale,
    linked_finding_type: input.linkedFindingType ?? null, linked_finding_id: input.linkedFindingId ?? null,
    linked_finding_description: input.linkedFindingDescription ?? null,
    decided_by: input.decidedBy, expected_outcome: input.expectedOutcome, review_date: input.reviewDate,
  });
  if (!row) throw new Error('Decision record was not created.');
  return fromRow(row);
}

export async function getDecision(id: string): Promise<DecisionRecord | null> {
  const rows = await supabaseSelect<DecisionRow>(TABLE, `id=eq.${encodeURIComponent(id)}&select=*`);
  return rows[0] ? fromRow(rows[0]) : null;
}

export interface ListDecisionsFilters { status?: DecisionStatus; dueBy?: string; limit?: number }

export async function listDecisions(filters: ListDecisionsFilters = {}): Promise<DecisionRecord[]> {
  const parts = ['select=*', 'order=review_date.asc', `limit=${filters.limit ?? 200}`];
  if (filters.status) parts.push(`status=eq.${filters.status}`);
  if (filters.dueBy) parts.push(`review_date=lte.${filters.dueBy}`);
  const rows = await supabaseSelect<DecisionRow>(TABLE, parts.join('&'));
  return rows.map(fromRow);
}

/** Section 35's "later compare outcome" — records what actually happened against `expectedOutcome`. Never auto-computed; a human states the actual outcome. */
export async function reviewDecision(id: string, role: 'admin' | 'director', expectedVersion: number, actualOutcome: string): Promise<DecisionRecord> {
  const rows = await supabasePatch<DecisionRow>(TABLE, `id=eq.${encodeURIComponent(id)}&version=eq.${expectedVersion}`, {
    status: 'REVIEWED', actual_outcome: actualOutcome, reviewed_by: role, reviewed_at: new Date().toISOString(),
    version: expectedVersion + 1, updated_at: new Date().toISOString(),
  });
  if (!rows[0]) throw new Error('Decision record was modified concurrently; reload before retrying.');
  return fromRow(rows[0]);
}
