// ─── Proactive customer action store ──────────────────────────────────────────
// VIA Customer Operations Phase 11: the one write path for proactive actions,
// their lifecycle, and their audit trail. Mirrors
// lib/operationalIntelligence/findingStore.ts's exact shape (optimistic
// concurrency via `version`, every transition audited, an audit-log write
// failure never blocks the transition itself).

import { supabaseSelect, supabaseInsert, supabasePatch } from '../supabase/rest.ts';
import { recordAnalyticsEvent } from '../analytics/events.ts';
import { isAnalyticsEventPipelineEnabled } from '../customerIdentity/featureFlags.ts';
import type {
  ProactiveCustomerAction, ProactiveActionCandidate, ProactiveActionType, ProactiveActionStatus,
  ProactiveActionChannel, MessageCategory, ProactivePriority, ServiceTeam, FollowUpStage,
  DismissalReason, ProactiveActionEvidenceItem,
} from './types.ts';
import { isTerminalStatus, isInFlightStatus } from './types.ts';

/** Best-effort, never blocks a transition — same discipline as recordActionEvent. */
function emitLifecycleEvent(eventType: 'proactive_action.detected' | 'proactive_action.approved' | 'proactive_action.responded' | 'proactive_action.converted' | 'proactive_action.expired', action: ProactiveCustomerAction): void {
  if (!isAnalyticsEventPipelineEnabled()) return;
  void recordAnalyticsEvent({
    eventType, sourceId: `${action.id}:${eventType}`, conversationId: action.conversationId,
    customerId: action.customerId, productId: action.productId, draftId: action.commercialDraftId, source: 'PROACTIVE',
  });
}

const TABLE = 'proactive_customer_actions';
const EVENTS_TABLE = 'proactive_action_events';

interface ActionRow {
  id: string; organization_id: string; type: string;
  customer_id: string | null; customer_phone_normalized: string | null; conversation_id: string | null;
  quotation_id: string | null; sales_order_id: string | null; commercial_draft_id: string | null;
  sample_request_id: string | null; product_id: string | null;
  reason: string; evidence: ProactiveActionEvidenceItem[];
  recommended_action: string; channel: string; message_category: string | null;
  status: string; priority: string; due_at: string | null;
  requires_approval: boolean; approved_by: string | null; approved_at: string | null;
  assigned_role: string | null; assigned_team: string | null;
  follow_up_stage: string | null;
  draft_message: string | null; sent_message: string | null; sent_at: string | null;
  responded_at: string | null; converted_at: string | null;
  potential_value: number | null; potential_value_label: string | null;
  dismissal_reason: string | null;
  dedupe_key: string; version: number; created_at: string; updated_at: string;
}

function fromRow(row: ActionRow): ProactiveCustomerAction {
  return {
    id: row.id, organizationId: row.organization_id, type: row.type as ProactiveActionType,
    customerId: row.customer_id, customerPhoneNormalized: row.customer_phone_normalized, conversationId: row.conversation_id,
    quotationId: row.quotation_id, salesOrderId: row.sales_order_id, commercialDraftId: row.commercial_draft_id,
    sampleRequestId: row.sample_request_id, productId: row.product_id,
    reason: row.reason, evidence: row.evidence ?? [],
    recommendedAction: row.recommended_action, channel: row.channel as ProactiveActionChannel,
    messageCategory: row.message_category as MessageCategory | null,
    status: row.status as ProactiveActionStatus, priority: row.priority as ProactivePriority, dueAt: row.due_at,
    requiresApproval: row.requires_approval, approvedBy: row.approved_by as 'admin' | 'director' | null, approvedAt: row.approved_at,
    assignedRole: row.assigned_role as 'admin' | 'director' | null, assignedTeam: row.assigned_team as ServiceTeam | null,
    followUpStage: row.follow_up_stage as FollowUpStage | null,
    draftMessage: row.draft_message, sentMessage: row.sent_message, sentAt: row.sent_at,
    respondedAt: row.responded_at, convertedAt: row.converted_at,
    potentialValue: row.potential_value, potentialValueLabel: row.potential_value_label,
    dismissalReason: row.dismissal_reason as DismissalReason | null,
    dedupeKey: row.dedupe_key, version: row.version, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export type ProactiveActor = 'SYSTEM' | 'JARVIS' | 'INTERNAL_USER';

export async function recordActionEvent(input: {
  actionId: string; eventType: string; actor: ProactiveActor; actorRole?: 'admin' | 'director' | null;
  fromValue?: string | null; toValue?: string | null; metadata?: Record<string, unknown>;
}): Promise<void> {
  console.info('[proactiveActions.auditLog]', JSON.stringify({
    event: input.eventType, actionId: input.actionId, actor: input.actor, from: input.fromValue ?? null, to: input.toValue ?? null,
  }));
  try {
    await supabaseInsert(EVENTS_TABLE, {
      action_id: input.actionId, event_type: input.eventType, actor: input.actor,
      actor_role: input.actorRole ?? null, from_value: input.fromValue ?? null, to_value: input.toValue ?? null,
      metadata: input.metadata ?? null,
    }, false);
  } catch (error) {
    console.error('[proactiveActions.auditLog] failed to persist audit row:', error);
  }
}

export async function getActionByDedupeKey(dedupeKey: string): Promise<ProactiveCustomerAction | null> {
  const rows = await supabaseSelect<ActionRow>(TABLE, `dedupe_key=eq.${encodeURIComponent(dedupeKey)}&select=*`);
  return rows[0] ? fromRow(rows[0]) : null;
}

export async function getAction(id: string): Promise<ProactiveCustomerAction | null> {
  const rows = await supabaseSelect<ActionRow>(TABLE, `id=eq.${encodeURIComponent(id)}&select=*`);
  return rows[0] ? fromRow(rows[0]) : null;
}

export interface ListActionsFilters {
  status?: ProactiveActionStatus[];
  type?: ProactiveActionType;
  assignedTeam?: ServiceTeam;
  customerId?: string;
  limit?: number;
}

const DEFAULT_LIST_STATUSES: ProactiveActionStatus[] = ['DETECTED', 'REVIEW_REQUIRED', 'APPROVED', 'SCHEDULED', 'SENT', 'CUSTOMER_RESPONDED'];

export async function listActions(filters: ListActionsFilters = {}): Promise<ProactiveCustomerAction[]> {
  const parts: string[] = ['select=*', 'order=priority.desc,due_at.asc.nullslast', `limit=${filters.limit ?? 200}`];
  parts.push(`status=in.(${(filters.status ?? DEFAULT_LIST_STATUSES).join(',')})`);
  if (filters.type) parts.push(`type=eq.${filters.type}`);
  if (filters.assignedTeam) parts.push(`assigned_team=eq.${filters.assignedTeam}`);
  if (filters.customerId) parts.push(`customer_id=eq.${encodeURIComponent(filters.customerId)}`);
  const rows = await supabaseSelect<ActionRow>(TABLE, parts.join('&'));
  return rows.map(fromRow);
}

/**
 * The detection engine's persist call (mirrors upsertFinding): a brand-new
 * candidate creates one DETECTED/REVIEW_REQUIRED row; a repeat detection
 * against a still-open candidate refreshes its evidence/reason in place
 * (never a duplicate row); a candidate that matches an action already
 * in-flight or already resolved by a human (DISMISSED/CONVERTED/etc.) is
 * left untouched — a human decision or an in-progress send is never
 * silently clobbered by the next sweep (brief's "customer response stops
 * inappropriate follow-up").
 */
export async function upsertAction(
  candidate: ProactiveActionCandidate,
  initialStatus: 'DETECTED' | 'REVIEW_REQUIRED',
  requiresApproval: boolean,
): Promise<{ action: ProactiveCustomerAction; isNew: boolean; skipped: boolean }> {
  const existing = await getActionByDedupeKey(candidate.dedupeKey);

  const base = {
    type: candidate.type,
    customer_id: candidate.customerId ?? null, customer_phone_normalized: candidate.customerPhoneNormalized ?? null,
    conversation_id: candidate.conversationId ?? null, quotation_id: candidate.quotationId ?? null,
    sales_order_id: candidate.salesOrderId ?? null, commercial_draft_id: candidate.commercialDraftId ?? null,
    sample_request_id: candidate.sampleRequestId ?? null, product_id: candidate.productId ?? null,
    reason: candidate.reason, evidence: candidate.evidence,
    recommended_action: candidate.recommendedAction, channel: candidate.channel,
    message_category: candidate.messageCategory ?? null,
    priority: candidate.priority, due_at: candidate.dueAt ?? null,
    assigned_team: candidate.assignedTeam ?? null, follow_up_stage: candidate.followUpStage ?? null,
    potential_value: candidate.potentialValue ?? null, potential_value_label: candidate.potentialValueLabel ?? null,
  };

  if (!existing) {
    const row = await supabaseInsert<ActionRow>(TABLE, {
      ...base, dedupe_key: candidate.dedupeKey, status: initialStatus, requires_approval: requiresApproval,
    });
    if (!row) throw new Error('Proactive action was not created.');
    const action = fromRow(row);
    await recordActionEvent({ actionId: action.id, eventType: 'action.detected', actor: 'SYSTEM', toValue: initialStatus });
    emitLifecycleEvent('proactive_action.detected', action);
    return { action, isNew: true, skipped: false };
  }

  if (isInFlightStatus(existing.status) || isTerminalStatus(existing.status)) {
    return { action: existing, isNew: false, skipped: true };
  }

  // Still DETECTED/REVIEW_REQUIRED — refresh evidence/reason in place, never touch status.
  const rows = await supabasePatch<ActionRow>(TABLE, `id=eq.${existing.id}&version=eq.${existing.version}`, {
    ...base, updated_at: new Date().toISOString(), version: existing.version + 1,
  });
  if (!rows[0]) throw new Error('Proactive action was modified concurrently.');
  return { action: fromRow(rows[0]), isNew: false, skipped: false };
}

async function transition(
  id: string, expectedVersion: number, patch: Record<string, unknown>,
  event: { eventType: string; actor: ProactiveActor; actorRole?: 'admin' | 'director' | null; fromValue?: string; toValue?: string; metadata?: Record<string, unknown> },
): Promise<ProactiveCustomerAction> {
  const rows = await supabasePatch<ActionRow>(TABLE, `id=eq.${encodeURIComponent(id)}&version=eq.${expectedVersion}`, {
    ...patch, version: expectedVersion + 1, updated_at: new Date().toISOString(),
  });
  if (!rows[0]) throw new Error('Proactive action was modified concurrently; reload before retrying.');
  const action = fromRow(rows[0]);
  await recordActionEvent({ actionId: id, eventType: event.eventType, actor: event.actor, actorRole: event.actorRole, fromValue: event.fromValue, toValue: event.toValue, metadata: event.metadata });
  return action;
}

/** Section 31: PREPARE -> reviewer approves. Facts are revalidated separately, immediately before send (see sendOutreach.ts). */
export async function approveAction(id: string, role: 'admin' | 'director', expectedVersion: number): Promise<ProactiveCustomerAction> {
  const action = await transition(id, expectedVersion, { status: 'APPROVED', approved_by: role, approved_at: new Date().toISOString() }, {
    eventType: 'action.approved', actor: 'INTERNAL_USER', actorRole: role, toValue: 'APPROVED',
  });
  emitLifecycleEvent('proactive_action.approved', action);
  return action;
}

export async function assignAction(id: string, role: 'admin' | 'director', expectedVersion: number, assignment: { assignedRole?: 'admin' | 'director'; assignedTeam?: ServiceTeam }): Promise<ProactiveCustomerAction> {
  return transition(id, expectedVersion, { assigned_role: assignment.assignedRole ?? null, assigned_team: assignment.assignedTeam ?? null }, {
    eventType: 'action.assigned', actor: 'INTERNAL_USER', actorRole: role, toValue: assignment.assignedRole ?? assignment.assignedTeam,
  });
}

export async function markScheduled(id: string, expectedVersion: number, draftMessage: string): Promise<ProactiveCustomerAction> {
  return transition(id, expectedVersion, { status: 'SCHEDULED', draft_message: draftMessage }, {
    eventType: 'action.scheduled', actor: 'SYSTEM', toValue: 'SCHEDULED',
  });
}

export async function markSent(id: string, expectedVersion: number, sentMessage: string): Promise<ProactiveCustomerAction> {
  return transition(id, expectedVersion, { status: 'SENT', sent_message: sentMessage, sent_at: new Date().toISOString() }, {
    eventType: 'action.sent', actor: 'SYSTEM', toValue: 'SENT',
  });
}

export async function markFailed(id: string, expectedVersion: number, reasonCode: string): Promise<ProactiveCustomerAction> {
  return transition(id, expectedVersion, { status: 'FAILED' }, {
    eventType: 'action.failed', actor: 'SYSTEM', toValue: 'FAILED', metadata: { reasonCode },
  });
}

export async function markCustomerResponded(id: string, expectedVersion: number): Promise<ProactiveCustomerAction> {
  const action = await transition(id, expectedVersion, { status: 'CUSTOMER_RESPONDED', responded_at: new Date().toISOString() }, {
    eventType: 'action.customer_responded', actor: 'SYSTEM', toValue: 'CUSTOMER_RESPONDED',
  });
  emitLifecycleEvent('proactive_action.responded', action);
  return action;
}

export async function markConverted(id: string, expectedVersion: number): Promise<ProactiveCustomerAction> {
  const action = await transition(id, expectedVersion, { status: 'CONVERTED', converted_at: new Date().toISOString() }, {
    eventType: 'action.converted', actor: 'SYSTEM', toValue: 'CONVERTED',
  });
  emitLifecycleEvent('proactive_action.converted', action);
  return action;
}

export async function markExpired(id: string, expectedVersion: number): Promise<ProactiveCustomerAction> {
  const action = await transition(id, expectedVersion, { status: 'EXPIRED' }, {
    eventType: 'action.expired', actor: 'SYSTEM', toValue: 'EXPIRED',
  });
  emitLifecycleEvent('proactive_action.expired', action);
  return action;
}

export async function dismissAction(id: string, role: 'admin' | 'director', expectedVersion: number, reason: DismissalReason): Promise<ProactiveCustomerAction> {
  return transition(id, expectedVersion, { status: 'DISMISSED', dismissal_reason: reason }, {
    eventType: 'action.dismissed', actor: 'INTERNAL_USER', actorRole: role, toValue: 'DISMISSED', metadata: { reason },
  });
}

export async function cancelAction(id: string, role: 'admin' | 'director', expectedVersion: number): Promise<ProactiveCustomerAction> {
  return transition(id, expectedVersion, { status: 'CANCELLED' }, {
    eventType: 'action.cancelled', actor: 'INTERNAL_USER', actorRole: role, toValue: 'CANCELLED',
  });
}
