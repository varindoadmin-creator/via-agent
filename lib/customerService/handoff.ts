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
import { sendWatiText } from '../integrations/wati/client.ts';
import { recordAnalyticsEvent } from '../analytics/events.ts';
import { isAnalyticsEventPipelineEnabled } from '../customerIdentity/featureFlags.ts';

const ACTIVE_HUMAN_STATES = new Set(['NEEDS_HUMAN', 'HUMAN_ASSIGNED', 'HUMAN_ACTIVE']);
/** Exported for reuse by app/api/wati/service/sweep — these same reasons are also excluded from the end-of-day auto-return-to-VIA sweep, never silently closed out. */
export const URGENT_REASONS = new Set<HandoffReason>(['COMPLAINT', 'SECURITY_SENSITIVE_REQUEST', 'PAYMENT_REVIEW', 'ZOHO_WRITE_FAILURE']);

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
  if (isAnalyticsEventPipelineEnabled()) {
    void recordAnalyticsEvent({ eventType: 'handoff.created', sourceId: `${phone}:${now}`, conversationId: phone, teamId: team, properties: { reason, priority } });
  }

  await sendHandoffNotification(phone, reason, team, priority).catch(error => {
    console.error('[customerService.handoff] notification failed:', error);
  });
  await sendStaffWhatsAppAlert(phone, reason, team, priority).catch(error => {
    console.error('[customerService.handoff] WhatsApp alert failed:', error);
  });
  await sendStaffEmailAlert(phone, reason, team, priority).catch(error => {
    console.error('[customerService.handoff] staff email alert failed:', error);
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

/** Indonesian local (0-prefixed) or bare-national number -> WhatsApp-dialable (62-prefixed, no leading 0/+). */
function toWatiDialableNumber(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('62')) return digits;
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  return `62${digits}`;
}

/**
 * 2026-09-01: every other automatic notification (email) is gated to
 * urgent/high-signal reasons only (brief section 44), which left an ordinary
 * "connect me to Admin" request with no immediate signal to staff — only the
 * 15-minute SLA sweep email. This fires unconditionally on every new handoff
 * episode so staff get pinged on WhatsApp (a channel they actually watch)
 * the moment any case needs a human, not just the urgent ones. Best-effort:
 * `sendWatiText` never throws on its own (logs and returns a status), and the
 * caller above also wraps this in its own `.catch()`.
 */
async function sendStaffWhatsAppAlert(phone: string, reason: HandoffReason, team: string, priority: string): Promise<void> {
  const staffNumber = process.env.CS_STAFF_WHATSAPP_NUMBER || '081288885224';
  const text = `Ada pelanggan (${phone}) yang menunggu bantuan Admin di WATI.\nAlasan: ${reason}\nTim: ${team} | Prioritas: ${priority}\nBuka: https://via-601025884976.asia-southeast2.run.app/requests/wati/customer-service`;
  const result = await sendWatiText(toWatiDialableNumber(staffNumber), text);
  if (result !== 'sent') {
    console.warn('[customerService.handoff]', JSON.stringify({ event: 'staff_whatsapp_alert_not_sent', result }));
    return;
  }
  await recordServiceEvent({ normalizedPhone: phone, eventType: 'service.notification_sent', actor: 'SYSTEM', toValue: 'whatsapp' });
}

/**
 * 2026-09-01: the WhatsApp alert above needs an active 24-hour WATI session
 * with the staff number to actually deliver, which isn't guaranteed — so
 * this unconditional email is the reliable channel of the pair, sent
 * alongside it (not instead of it) on every new handoff episode. Distinct
 * from sendHandoffNotification()'s urgent-only VIA_ALERT_EMAIL: that one
 * stays as-is for the existing "only urgent reasons" audience; this one is
 * the immediate, every-handoff signal to the operational admin inbox.
 */
async function sendStaffEmailAlert(phone: string, reason: HandoffReason, team: string, priority: string): Promise<void> {
  const to = process.env.CS_STAFF_ALERT_EMAIL || 'admin@varindo.co.id';
  const url = 'https://via-601025884976.asia-southeast2.run.app/requests/wati/customer-service';
  await sendMail({
    to,
    subject: `Ada pelanggan menunggu Admin (${reason})`,
    html: `<p>Pelanggan (<code>${phone}</code>) menunggu bantuan Admin di WATI:</p><ul><li>Alasan: ${reason}</li><li>Tim: ${team}</li><li>Prioritas: ${priority}</li></ul><p><a href="${url}">Buka Customer Service di VIA →</a></p>`,
  });
  await recordServiceEvent({ normalizedPhone: phone, eventType: 'service.notification_sent', actor: 'SYSTEM', toValue: 'staff_email' });
}
