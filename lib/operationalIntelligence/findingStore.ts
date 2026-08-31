// ─── Operational finding store ────────────────────────────────────────────────
// VIA Customer Operations Phase 10, brief sections 41-44, 54-56, 91: the one
// write path for findings, their lifecycle, and their audit trail — mirrors
// lib/customerService/auditLog.ts + caseActions.ts's exact shape (optimistic
// concurrency via `version`, every transition audited, audit failure never
// blocks the transition itself).

import { supabaseSelect, supabaseInsert, supabasePatch } from '../supabase/rest.ts';
import type {
  OperationalFinding, FindingCategory, FindingStatus, Severity, Confidence, FindingEvidence,
  BaselineType, DismissalReason, RecommendedActionType,
} from './types.ts';

const TABLE = 'operational_findings';
const EVENTS_TABLE = 'operational_finding_events';
const ACTIONS_TABLE = 'operational_actions';

interface FindingRow {
  id: string; organization_id: string; category: string; type: string;
  severity: string; urgency: string; status: string; title: string;
  metric_key: string | null; entity_type: string | null; entity_id: string | null;
  detected_at: string; period_start: string | null; period_end: string | null;
  current_value: number | null; baseline_value: number | null; baseline_type: string | null;
  absolute_change: number | null; percent_change: number | null; resolved_value: number | null;
  evidence: FindingEvidence[]; confidence: string;
  recommended_action_type: string | null; recommendation_text: string | null;
  assigned_role: string | null; assigned_team: string | null; due_at: string | null;
  dedupe_key: string; rule_version: number;
  consecutive_breach_count: number; consecutive_normal_count: number; recurrence_count: number;
  dismissal_reason: string | null; last_alerted_at: string | null; version: number; created_at: string; updated_at: string;
}

function fromRow(row: FindingRow): OperationalFinding {
  return {
    id: row.id, organizationId: row.organization_id,
    category: row.category as FindingCategory, type: row.type,
    severity: row.severity as Severity, urgency: row.urgency as Severity, status: row.status as FindingStatus,
    title: row.title,
    metricKey: row.metric_key, entityType: row.entity_type, entityId: row.entity_id,
    detectedAt: row.detected_at, periodStart: row.period_start, periodEnd: row.period_end,
    currentValue: row.current_value, baselineValue: row.baseline_value, baselineType: row.baseline_type as BaselineType | null,
    absoluteChange: row.absolute_change, percentChange: row.percent_change, resolvedValue: row.resolved_value,
    evidence: row.evidence ?? [], confidence: row.confidence as Confidence,
    recommendedActionType: row.recommended_action_type as RecommendedActionType | null,
    recommendationText: row.recommendation_text,
    assignedRole: row.assigned_role as 'admin' | 'director' | null,
    assignedTeam: row.assigned_team as OperationalFinding['assignedTeam'],
    dueAt: row.due_at, dedupeKey: row.dedupe_key, ruleVersion: row.rule_version,
    consecutiveBreachCount: row.consecutive_breach_count, consecutiveNormalCount: row.consecutive_normal_count,
    recurrenceCount: row.recurrence_count, dismissalReason: row.dismissal_reason as DismissalReason | null,
    lastAlertedAt: row.last_alerted_at,
    version: row.version, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

const NON_TERMINAL: FindingStatus[] = ['OPEN', 'ACKNOWLEDGED', 'ACTION_PLANNED', 'IN_PROGRESS'];
const TERMINAL: FindingStatus[] = ['RESOLVED', 'DISMISSED', 'EXPIRED'];

export type FindingActor = 'SYSTEM' | 'JARVIS' | 'INTERNAL_USER';

export async function recordFindingEvent(input: {
  findingId: string; eventType: string; actor: FindingActor; actorRole?: 'admin' | 'director' | null;
  fromValue?: string | null; toValue?: string | null; metadata?: Record<string, unknown>;
}): Promise<void> {
  console.info('[operationalIntelligence.auditLog]', JSON.stringify({
    event: input.eventType, findingId: input.findingId, actor: input.actor, from: input.fromValue ?? null, to: input.toValue ?? null,
  }));
  try {
    await supabaseInsert(EVENTS_TABLE, {
      finding_id: input.findingId, event_type: input.eventType, actor: input.actor,
      actor_role: input.actorRole ?? null, from_value: input.fromValue ?? null, to_value: input.toValue ?? null,
      metadata: input.metadata ?? null,
    }, false);
  } catch (error) {
    console.error('[operationalIntelligence.auditLog] failed to persist audit row:', error);
  }
}

export async function markAlerted(id: string): Promise<void> {
  await supabasePatch(TABLE, `id=eq.${encodeURIComponent(id)}`, { last_alerted_at: new Date().toISOString() });
  await recordFindingEvent({ findingId: id, eventType: 'finding.alert_sent', actor: 'SYSTEM' });
}

export async function getFindingByDedupeKey(dedupeKey: string): Promise<OperationalFinding | null> {
  const rows = await supabaseSelect<FindingRow>(TABLE, `dedupe_key=eq.${encodeURIComponent(dedupeKey)}&select=*`);
  return rows[0] ? fromRow(rows[0]) : null;
}

export async function getFinding(id: string): Promise<OperationalFinding | null> {
  const rows = await supabaseSelect<FindingRow>(TABLE, `id=eq.${encodeURIComponent(id)}&select=*`);
  return rows[0] ? fromRow(rows[0]) : null;
}

export interface ListFindingsFilters {
  status?: FindingStatus[];
  category?: FindingCategory;
  severity?: Severity[];
  assignedRole?: 'admin' | 'director';
  limit?: number;
}

export async function listFindings(filters: ListFindingsFilters = {}): Promise<OperationalFinding[]> {
  const parts: string[] = ['select=*', `order=detected_at.desc`, `limit=${filters.limit ?? 200}`];
  parts.push(`status=in.(${(filters.status ?? NON_TERMINAL).join(',')})`);
  if (filters.category) parts.push(`category=eq.${filters.category}`);
  if (filters.severity?.length) parts.push(`severity=in.(${filters.severity.join(',')})`);
  if (filters.assignedRole) parts.push(`assigned_role=eq.${filters.assignedRole}`);
  const rows = await supabaseSelect<FindingRow>(TABLE, parts.join('&'));
  return rows.map(fromRow);
}

export interface FindingWriteInput {
  category: FindingCategory; type: string; title: string; dedupeKey: string;
  severity: Severity; urgency: Severity; confidence: Confidence;
  metricKey?: string; entityType?: string; entityId?: string;
  periodStart?: string; periodEnd?: string;
  currentValue?: number; baselineValue?: number | null; baselineType?: BaselineType;
  absoluteChange?: number; percentChange?: number | null;
  evidence: FindingEvidence[];
  recommendedActionType?: RecommendedActionType; recommendationText?: string;
  assignedTeam?: OperationalFinding['assignedTeam'];
  ruleVersion: number;
}

/**
 * The detection engine's persist call for a breaching condition (brief
 * sections 41-44): creates a new OPEN finding, updates an already-open one
 * in place (never a duplicate row per scheduled run), or reopens a
 * previously RESOLVED/DISMISSED one as a tracked recurrence.
 */
export async function upsertFinding(input: FindingWriteInput): Promise<{ finding: OperationalFinding; isNew: boolean; isRecurrence: boolean }> {
  const existing = await getFindingByDedupeKey(input.dedupeKey);
  const base = {
    category: input.category, type: input.type, title: input.title,
    severity: input.severity, urgency: input.urgency, confidence: input.confidence,
    metric_key: input.metricKey ?? null, entity_type: input.entityType ?? null, entity_id: input.entityId ?? null,
    period_start: input.periodStart ?? null, period_end: input.periodEnd ?? null,
    current_value: input.currentValue ?? null, baseline_value: input.baselineValue ?? null, baseline_type: input.baselineType ?? null,
    absolute_change: input.absoluteChange ?? null, percent_change: input.percentChange ?? null,
    evidence: input.evidence, recommended_action_type: input.recommendedActionType ?? null,
    recommendation_text: input.recommendationText ?? null, assigned_team: input.assignedTeam ?? null,
    rule_version: input.ruleVersion,
  };

  if (!existing) {
    const row = await supabaseInsert<FindingRow>(TABLE, { ...base, dedupe_key: input.dedupeKey, status: 'OPEN', consecutive_breach_count: 1, consecutive_normal_count: 0 });
    if (!row) throw new Error('Operational finding was not created.');
    const finding = fromRow(row);
    await recordFindingEvent({ findingId: finding.id, eventType: 'finding.detected', actor: 'SYSTEM', toValue: input.severity });
    return { finding, isNew: true, isRecurrence: false };
  }

  const isRecurrence = TERMINAL.includes(existing.status);
  const patch: Record<string, unknown> = {
    ...base, updated_at: new Date().toISOString(),
    consecutive_breach_count: isRecurrence ? 1 : existing.consecutiveBreachCount + 1,
    consecutive_normal_count: 0,
  };
  if (isRecurrence) {
    patch.status = 'OPEN';
    patch.recurrence_count = existing.recurrenceCount + 1;
  }

  const rows = await supabasePatch<FindingRow>(TABLE, `id=eq.${existing.id}&version=eq.${existing.version}`, { ...patch, version: existing.version + 1 });
  if (!rows[0]) throw new Error('Operational finding was modified concurrently.');
  const finding = fromRow(rows[0]);

  if (isRecurrence) {
    await recordFindingEvent({ findingId: finding.id, eventType: 'finding.recurred', actor: 'SYSTEM', fromValue: existing.status, toValue: 'OPEN', metadata: { recurrenceCount: finding.recurrenceCount } });
  } else if (existing.severity !== finding.severity) {
    await recordFindingEvent({ findingId: finding.id, eventType: 'finding.severity_changed', actor: 'SYSTEM', fromValue: existing.severity, toValue: finding.severity });
  }
  return { finding, isNew: false, isRecurrence };
}

/**
 * The detection engine's call when a rule's condition is currently normal
 * (brief section 43) — tracks the recovery counter and, only once the
 * persistence-window requirement is met AND auto-resolution is enabled,
 * resolves the finding. With the flag off, the counter still accrues so
 * turning the flag on later does not require re-observing recovery from zero.
 */
export async function recordNormalPass(dedupeKey: string, currentValue: number | null, autoResolveEnabled: boolean, requiredWindows: number): Promise<OperationalFinding | null> {
  const existing = await getFindingByDedupeKey(dedupeKey);
  if (!existing || !NON_TERMINAL.includes(existing.status)) return null;

  const nextNormalCount = existing.consecutiveNormalCount + 1;
  const shouldResolve = autoResolveEnabled && nextNormalCount >= requiredWindows;

  const patch: Record<string, unknown> = {
    consecutive_normal_count: nextNormalCount, consecutive_breach_count: 0, updated_at: new Date().toISOString(),
  };
  if (shouldResolve) {
    patch.status = 'RESOLVED';
    patch.resolved_value = currentValue;
  }

  const rows = await supabasePatch<FindingRow>(TABLE, `id=eq.${existing.id}&version=eq.${existing.version}`, { ...patch, version: existing.version + 1 });
  if (!rows[0]) return null;
  const finding = fromRow(rows[0]);
  if (shouldResolve) {
    await recordFindingEvent({ findingId: finding.id, eventType: 'finding.auto_resolved', actor: 'SYSTEM', fromValue: existing.status, toValue: 'RESOLVED', metadata: { resolvedValue: currentValue } });
  }
  return finding;
}

async function transition(id: string, expectedVersion: number, patch: Record<string, unknown>, event: { eventType: string; actorRole: 'admin' | 'director'; fromValue?: string; toValue?: string; metadata?: Record<string, unknown> }): Promise<OperationalFinding> {
  const rows = await supabasePatch<FindingRow>(TABLE, `id=eq.${encodeURIComponent(id)}&version=eq.${expectedVersion}`, { ...patch, version: expectedVersion + 1, updated_at: new Date().toISOString() });
  if (!rows[0]) throw new Error('Finding was modified concurrently; reload before retrying.');
  const finding = fromRow(rows[0]);
  await recordFindingEvent({ findingId: id, eventType: event.eventType, actor: 'INTERNAL_USER', actorRole: event.actorRole, fromValue: event.fromValue, toValue: event.toValue, metadata: event.metadata });
  return finding;
}

export async function acknowledgeFinding(id: string, role: 'admin' | 'director', expectedVersion: number): Promise<OperationalFinding> {
  return transition(id, expectedVersion, { status: 'ACKNOWLEDGED' }, { eventType: 'finding.acknowledged', actorRole: role, toValue: 'ACKNOWLEDGED' });
}

export async function assignFinding(id: string, role: 'admin' | 'director', expectedVersion: number, assignment: { assignedRole?: 'admin' | 'director'; assignedTeam?: OperationalFinding['assignedTeam'] }): Promise<OperationalFinding> {
  return transition(id, expectedVersion, { assigned_role: assignment.assignedRole ?? null, assigned_team: assignment.assignedTeam ?? null }, { eventType: 'finding.assigned', actorRole: role, toValue: assignment.assignedRole ?? assignment.assignedTeam ?? undefined });
}

export async function resolveFinding(id: string, role: 'admin' | 'director', expectedVersion: number): Promise<OperationalFinding> {
  return transition(id, expectedVersion, { status: 'RESOLVED' }, { eventType: 'finding.resolved', actorRole: role, toValue: 'RESOLVED' });
}

export async function dismissFinding(id: string, role: 'admin' | 'director', expectedVersion: number, reason: DismissalReason): Promise<OperationalFinding> {
  return transition(id, expectedVersion, { status: 'DISMISSED', dismissal_reason: reason }, { eventType: 'finding.dismissed', actorRole: role, toValue: 'DISMISSED', metadata: { reason } });
}

// ─── Action plan (brief section 56) ───────────────────────────────────────────

export interface OperationalAction {
  id: string; findingId: string; description: string;
  ownerRole: 'admin' | 'director' | null; ownerTeam: OperationalFinding['assignedTeam'] | null;
  status: 'TODO' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
  dueAt: string | null; completedAt: string | null; createdAt: string; updatedAt: string;
}

interface ActionRow {
  id: string; finding_id: string; description: string; owner_role: string | null; owner_team: string | null;
  status: string; due_at: string | null; completed_at: string | null; created_at: string; updated_at: string;
}

function actionFromRow(row: ActionRow): OperationalAction {
  return {
    id: row.id, findingId: row.finding_id, description: row.description,
    ownerRole: row.owner_role as OperationalAction['ownerRole'], ownerTeam: row.owner_team as OperationalAction['ownerTeam'],
    status: row.status as OperationalAction['status'], dueAt: row.due_at, completedAt: row.completed_at,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

/** Creating an action plan also moves the finding to ACTION_PLANNED (brief section 42's lifecycle). */
export async function createActionPlan(findingId: string, role: 'admin' | 'director', expectedVersion: number, input: { description: string; ownerRole?: 'admin' | 'director'; ownerTeam?: OperationalFinding['assignedTeam']; dueAt?: string }): Promise<{ action: OperationalAction; finding: OperationalFinding }> {
  const row = await supabaseInsert<ActionRow>(ACTIONS_TABLE, {
    finding_id: findingId, description: input.description,
    owner_role: input.ownerRole ?? null, owner_team: input.ownerTeam ?? null, due_at: input.dueAt ?? null,
  });
  if (!row) throw new Error('Action plan was not created.');
  const finding = await transition(findingId, expectedVersion, { status: 'ACTION_PLANNED' }, { eventType: 'finding.action_created', actorRole: role, toValue: 'ACTION_PLANNED', metadata: { description: input.description } });
  return { action: actionFromRow(row), finding };
}

export async function listActions(findingId: string): Promise<OperationalAction[]> {
  const rows = await supabaseSelect<ActionRow>(ACTIONS_TABLE, `finding_id=eq.${encodeURIComponent(findingId)}&select=*&order=created_at.desc`);
  return rows.map(actionFromRow);
}

export async function updateActionStatus(actionId: string, status: OperationalAction['status'], role: 'admin' | 'director'): Promise<OperationalAction> {
  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (status === 'DONE') patch.completed_at = new Date().toISOString();
  const rows = await supabasePatch<ActionRow>(ACTIONS_TABLE, `id=eq.${encodeURIComponent(actionId)}`, patch);
  if (!rows[0]) throw new Error('Action plan not found.');
  const action = actionFromRow(rows[0]);
  if (status === 'DONE') {
    await recordFindingEvent({ findingId: action.findingId, eventType: 'finding.action_completed', actor: 'INTERNAL_USER', actorRole: role, toValue: actionId });
  }
  return action;
}
