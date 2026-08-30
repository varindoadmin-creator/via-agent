// ─── Case lifecycle actions ───────────────────────────────────────────────────
// VIA Customer Operations Phase 8, brief sections 6-7, 33-35: the explicit
// VIA-side Take Over / Return to VIA / Resolve / Reopen mechanism — built
// because no verified WATI operator-state API exists in this codebase (see
// docs/customer-service-operations.md). Every transition uses optimistic
// concurrency (expectedVersion) so a stale admin action can never silently
// overwrite a newer one.

import { getServiceCase, updateServiceCase, type ServiceCase } from '../integrations/wati/conversationState.ts';
import { recordServiceEvent } from './auditLog.ts';
import type { Role } from '../auth.ts';

export async function takeOver(phone: string, role: Role): Promise<ServiceCase> {
  const existing = await getServiceCase(phone);
  if (!existing) throw new Error('No service case exists for this conversation.');
  const updated = await updateServiceCase(phone, {
    state: 'HUMAN_ACTIVE',
    assigned_role: role,
    human_assigned_at: existing.human_assigned_at ?? new Date().toISOString(),
  }, existing.version);
  if (!updated) throw new Error('Case was modified concurrently; reload before retrying.');
  await recordServiceEvent({ normalizedPhone: phone, eventType: 'service.human_takeover', actor: 'INTERNAL_USER', actorRole: role, fromValue: existing.state, toValue: 'HUMAN_ACTIVE' });
  return updated;
}

/**
 * Brief section 7: a controlled transition, "only if no sensitive/risky
 * workflow remains active." VIA does not attempt to auto-verify that — the
 * Admin clicking this button is the judgment call the brief describes;
 * this function's job is only to make the transition itself safe
 * (versioned, audited) and to preserve conversation context (nothing about
 * the customer/product/order/draft state is touched).
 */
export async function returnToAuto(phone: string, role: Role): Promise<ServiceCase> {
  const existing = await getServiceCase(phone);
  if (!existing) throw new Error('No service case exists for this conversation.');
  const updated = await updateServiceCase(phone, { state: 'AUTO', assigned_role: null }, existing.version);
  if (!updated) throw new Error('Case was modified concurrently; reload before retrying.');
  await recordServiceEvent({ normalizedPhone: phone, eventType: 'service.returned_to_auto', actor: 'INTERNAL_USER', actorRole: role, fromValue: existing.state, toValue: 'AUTO' });
  return updated;
}

export async function resolveCase(phone: string, role: Role): Promise<ServiceCase> {
  const existing = await getServiceCase(phone);
  if (!existing) throw new Error('No service case exists for this conversation.');
  const updated = await updateServiceCase(phone, { state: 'RESOLVED', resolved_at: new Date().toISOString() }, existing.version);
  if (!updated) throw new Error('Case was modified concurrently; reload before retrying.');
  await recordServiceEvent({ normalizedPhone: phone, eventType: 'service.resolved', actor: 'INTERNAL_USER', actorRole: role, fromValue: existing.state, toValue: 'RESOLVED' });
  return updated;
}

export async function closeCase(phone: string, role: Role): Promise<ServiceCase> {
  const existing = await getServiceCase(phone);
  if (!existing) throw new Error('No service case exists for this conversation.');
  const updated = await updateServiceCase(phone, { state: 'CLOSED', closed_at: new Date().toISOString() }, existing.version);
  if (!updated) throw new Error('Case was modified concurrently; reload before retrying.');
  await recordServiceEvent({ normalizedPhone: phone, eventType: 'service.closed', actor: 'INTERNAL_USER', actorRole: role, fromValue: existing.state, toValue: 'CLOSED' });
  return updated;
}

export async function reopenCase(phone: string, role: Role): Promise<ServiceCase> {
  const existing = await getServiceCase(phone);
  if (!existing) throw new Error('No service case exists for this conversation.');
  const updated = await updateServiceCase(phone, { state: 'NEEDS_HUMAN', handoff_created_at: new Date().toISOString(), resolved_at: null, closed_at: null }, existing.version);
  if (!updated) throw new Error('Case was modified concurrently; reload before retrying.');
  await recordServiceEvent({ normalizedPhone: phone, eventType: 'service.reopened', actor: 'INTERNAL_USER', actorRole: role, fromValue: existing.state, toValue: 'NEEDS_HUMAN' });
  return updated;
}
