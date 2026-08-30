// ─── Human handoff ────────────────────────────────────────────────────────────
// VIA Customer Operations Phase 8, brief sections 3-4, 37: the single entry
// point that creates/advances a handoff. Idempotent — a duplicate trigger
// while a human episode is already active (NEEDS_HUMAN/HUMAN_ASSIGNED/
// HUMAN_ACTIVE) never resets the SLA clock, never reassigns, and never
// double-sends the urgent-handoff email. The primary duplicate-webhook
// defense is still the existing wati_messages idempotency gate (a retried
// webhook never reaches this function twice for the same inbound message);
// this idempotency is defense in depth for two distinct real messages that
// both trigger a handoff before an admin has acted.

import { getServiceCase, updateServiceCase, type ServiceCase } from '../integrations/wati/conversationState.ts';
import { teamForReason, type HandoffReason } from './handoffReasons.ts';
import { computeInitialPriority } from './priority.ts';
import { computeCaseSlaStatus } from './sla.ts';
import { recordServiceEvent } from './auditLog.ts';
import { sendMail } from '../email/sendMail.ts';

const ACTIVE_HUMAN_STATES = new Set(['NEEDS_HUMAN', 'HUMAN_ASSIGNED', 'HUMAN_ACTIVE']);
const URGENT_REASONS = new Set<HandoffReason>(['COMPLAINT', 'SECURITY_SENSITIVE_REQUEST', 'PAYMENT_REVIEW', 'ZOHO_WRITE_FAILURE']);

export interface HandoffResult {
  case: ServiceCase;
  isNewEpisode: boolean;
}

export async function triggerHandoff(phone: string, reason: HandoffReason, context?: { customerMessageText?: string }): Promise<HandoffResult> {
  const existing = await getServiceCase(phone);

  if (existing && ACTIVE_HUMAN_STATES.has(existing.state)) {
    // Already an active human episode — no-op (idempotent), per brief section 37.
    return { case: existing, isNewEpisode: false };
  }

  const priority = computeInitialPriority({
    reason,
    customerMessageText: context?.customerMessageText,
    slaAlreadyBreached: existing?.handoff_created_at ? computeCaseSlaStatus(new Date(existing.handoff_created_at)) === 'BREACHED' : false,
  });
  const team = teamForReason(reason);
  const now = new Date().toISOString();

  const updated = await updateServiceCase(phone, {
    state: 'NEEDS_HUMAN',
    handoff_reason: reason,
    handoff_created_at: now,
    priority,
    assigned_team: team,
    assigned_role: null,
    human_assigned_at: null,
    human_first_response_at: null,
    resolved_at: null,
    closed_at: null,
  });
  if (!updated) throw new Error('Unable to create handoff case.');

  await recordServiceEvent({ normalizedPhone: phone, eventType: 'service.handoff_created', actor: 'SYSTEM', toValue: reason, metadata: { team, priority } });

  await sendHandoffNotification(phone, reason, team, priority).catch(error => {
    console.error('[customerService.handoff] notification failed:', error);
  });

  return { case: updated, isNewEpisode: true };
}

async function sendHandoffNotification(phone: string, reason: HandoffReason, team: string, priority: string): Promise<void> {
  // Brief section 44: don't notify for every normal automation — only urgent/high-signal reasons.
  if (!URGENT_REASONS.has(reason) && priority !== 'HIGH' && priority !== 'URGENT') return;
  const to = process.env.VIA_ALERT_EMAIL || 'varindo.admin@gmail.com';
  const url = 'https://via-601025884976.asia-southeast2.run.app/requests/wati/customer-service';
  await sendMail({
    to,
    subject: `VIA Alert: new ${priority} handoff (${reason})`,
    html: `<p>New customer-service handoff for <code>${phone}</code>:</p><ul><li>Reason: ${reason}</li><li>Team: ${team}</li><li>Priority: ${priority}</li></ul><p><a href="${url}">Open Customer Service in VIA →</a></p>`,
  });
  await recordServiceEvent({ normalizedPhone: phone, eventType: 'service.notification_sent', actor: 'SYSTEM', toValue: 'email' });
}
