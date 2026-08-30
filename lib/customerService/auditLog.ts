// ─── Customer-service audit log ──────────────────────────────────────────────
// VIA Customer Operations Phase 8, brief sections 60-61: the single write
// path for every handoff/assignment/takeover/transfer/SLA/resolution event —
// both the durable audit row and the service.* observability event (a plain
// console.info, same convention as every other phase's observability).

import { supabaseInsert } from '../supabase/rest.ts';

const TABLE = 'customer_service_audit_log';

export type ServiceEventType =
  | 'service.handoff_created' | 'service.assigned' | 'service.reassigned' | 'service.human_takeover'
  | 'service.returned_to_auto' | 'service.waiting_customer' | 'service.waiting_internal' | 'service.waiting_vendor'
  | 'service.sla_warning' | 'service.sla_breached' | 'service.escalated' | 'service.resolved'
  | 'service.reopened' | 'service.closed' | 'service.notification_sent' | 'service.team_transfer'
  | 'service.priority_changed';

export type ServiceActor = 'SYSTEM' | 'JARVIS' | 'INTERNAL_USER';

export async function recordServiceEvent(input: {
  normalizedPhone: string;
  eventType: ServiceEventType;
  actor: ServiceActor;
  actorRole?: 'admin' | 'director' | null;
  fromValue?: string | null;
  toValue?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  console.info('[customerService.auditLog]', JSON.stringify({
    event: input.eventType, phoneKey: input.normalizedPhone, actor: input.actor,
    from: input.fromValue ?? null, to: input.toValue ?? null,
  }));
  try {
    await supabaseInsert(TABLE, {
      normalized_phone: input.normalizedPhone,
      event_type: input.eventType,
      actor: input.actor,
      actor_role: input.actorRole ?? null,
      from_value: input.fromValue ?? null,
      to_value: input.toValue ?? null,
      metadata: input.metadata ?? null,
    }, false);
  } catch (error) {
    // Audit-log failure must never block the actual operation it's recording.
    console.error('[customerService.auditLog] failed to persist audit row:', error);
  }
}
