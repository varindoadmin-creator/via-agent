// ─── Assignment engine ────────────────────────────────────────────────────────
// VIA Customer Operations Phase 8, brief sections 8-12: deterministic
// assignment only. "assignedUserId" is modeled as "assigned role" since VIA
// has exactly two shared role accounts (admin/director), not a per-user
// directory (lib/auth.ts) — documented scoping decision, not an omission.

import { getServiceCase, updateServiceCase, type ServiceCase } from '../integrations/wati/conversationState.ts';
import { recordServiceEvent } from './auditLog.ts';
import { supabaseSelect } from '../supabase/rest.ts';
import type { Role } from '../auth.ts';
import type { ServiceTeam } from './handoffReasons.ts';

export async function assignToRole(phone: string, role: Role, actorRole: Role): Promise<ServiceCase> {
  const existing = await getServiceCase(phone);
  if (!existing) throw new Error('No service case exists for this conversation.');
  const wasAssigned = Boolean(existing.assigned_role);
  const updated = await updateServiceCase(phone, {
    assigned_role: role,
    state: existing.state === 'NEEDS_HUMAN' ? 'HUMAN_ASSIGNED' : existing.state,
    human_assigned_at: existing.human_assigned_at ?? new Date().toISOString(),
  }, existing.version);
  if (!updated) throw new Error('Case was modified concurrently; reload before retrying.');
  await recordServiceEvent({
    normalizedPhone: phone, eventType: wasAssigned ? 'service.reassigned' : 'service.assigned',
    actor: 'INTERNAL_USER', actorRole, fromValue: existing.assigned_role, toValue: role,
  });
  return updated;
}

export async function assignToTeam(phone: string, team: ServiceTeam, actorRole: Role): Promise<ServiceCase> {
  const existing = await getServiceCase(phone);
  if (!existing) throw new Error('No service case exists for this conversation.');
  const fromTeam = existing.assigned_team;
  const updated = await updateServiceCase(phone, { assigned_team: team }, existing.version);
  if (!updated) throw new Error('Case was modified concurrently; reload before retrying.');
  await recordServiceEvent({
    normalizedPhone: phone, eventType: fromTeam && fromTeam !== team ? 'service.team_transfer' : 'service.assigned',
    actor: 'INTERNAL_USER', actorRole, fromValue: fromTeam, toValue: team,
    metadata: fromTeam && fromTeam !== team ? { fromTeam, toTeam: team } : undefined,
  });
  return updated;
}

/** Brief section 12: simple deterministic least-open-cases suggestion, no ML. Since roles are shared accounts, this only ever has two candidates (admin/director). */
export async function leastOpenCasesRole(): Promise<Role> {
  const [adminOpen, directorOpen] = await Promise.all([
    supabaseSelect<{ customer_phone_normalized: string }>('wati_conversation_state', `assigned_role=eq.admin&state=in.(NEEDS_HUMAN,HUMAN_ASSIGNED,HUMAN_ACTIVE)&select=customer_phone_normalized`),
    supabaseSelect<{ customer_phone_normalized: string }>('wati_conversation_state', `assigned_role=eq.director&state=in.(NEEDS_HUMAN,HUMAN_ASSIGNED,HUMAN_ACTIVE)&select=customer_phone_normalized`),
  ]);
  return adminOpen.length <= directorOpen.length ? 'admin' : 'director';
}
