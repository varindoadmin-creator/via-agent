// ─── Service recovery detector ────────────────────────────────────────────────
// VIA Customer Operations Phase 11, brief section 25: a case that took longer
// than the SLA breach threshold to resolve is a concrete, per-customer signal
// worth a factual check-in — reuses Phase 8's own SLA threshold
// (CS_SLA_BREACH_MINUTES) rather than Phase 10's aggregate
// CUSTOMER_SERVICE_SLA_DETERIORATION finding, which has no per-case/customer
// linkage to message from. Never offers compensation (brief's explicit
// instruction) — the message is a factual apology only (messageContent.ts).

import { supabaseSelect } from '../../supabase/rest.ts';
import type { ProactiveActionCandidate } from '../types.ts';

function envMinutes(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

interface CaseRow { customer_phone_normalized: string; handoff_created_at: string | null; resolved_at: string | null }

export async function detectServiceRecoveryCandidates(): Promise<ProactiveActionCandidate[]> {
  const breachMinutes = envMinutes('CS_SLA_BREACH_MINUTES', 60);
  const lookbackHours = envMinutes('PROACTIVE_SERVICE_RECOVERY_LOOKBACK_HOURS', 24);
  const lookbackCutoff = new Date(Date.now() - lookbackHours * 60 * 60_000).toISOString();

  const rows = await supabaseSelect<CaseRow>(
    'wati_conversation_state',
    `state=eq.RESOLVED&resolved_at=gte.${lookbackCutoff}&handoff_created_at=not.is.null&select=customer_phone_normalized,handoff_created_at,resolved_at&limit=200`,
  );

  const candidates: ProactiveActionCandidate[] = [];
  for (const row of rows) {
    if (!row.handoff_created_at || !row.resolved_at) continue;
    const resolutionMinutes = (new Date(row.resolved_at).getTime() - new Date(row.handoff_created_at).getTime()) / 60_000;
    if (resolutionMinutes < breachMinutes) continue;

    candidates.push({
      type: 'SERVICE_RECOVERY',
      customerPhoneNormalized: row.customer_phone_normalized, conversationId: row.customer_phone_normalized,
      reason: `Case took ${Math.round(resolutionMinutes)}m to resolve, past the ${breachMinutes}m SLA target.`,
      evidence: [{ label: 'Resolution time (minutes)', value: Math.round(resolutionMinutes) }, { label: 'SLA target (minutes)', value: breachMinutes }],
      recommendedAction: 'Send a factual apology/check-in — never automatically offer compensation.',
      channel: 'WHATSAPP', messageCategory: 'SERVICE_MESSAGE', assignedTeam: 'CUSTOMER_SERVICE', priority: 'NORMAL',
      dedupeKey: `SERVICE_RECOVERY:${row.customer_phone_normalized}:${row.resolved_at}`,
    });
  }
  return candidates;
}
