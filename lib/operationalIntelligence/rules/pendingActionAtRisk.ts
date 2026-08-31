// VIA Customer Operations Phase 10, brief section 8: PENDING_ACTION_AT_RISK —
// forgotten pending work, the phase's original motivating problem. Covers the
// two cases with a clean, existing data trail: a case sitting unassigned too
// long, and a vendor stock response that arrived but the conversation shows
// no activity since (a proxy for "customer not yet updated" — the exact
// example in brief section 103 — using wati_conversation_state.updated_at
// rather than a per-message scan, since a real reply always bumps that
// timestamp).

import { supabaseSelect } from '../../supabase/rest.ts';
import { getDetectionRule, evaluateThreshold } from '../detectionRules.ts';
import type { FindingCandidate } from '../types.ts';

function envMinutes(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

interface OpenCaseRow { customer_phone_normalized: string; handoff_created_at: string | null; assigned_role: string | null }
interface StockInquiryRow { id: string; conversation_id: string; closed_at: string | null }
interface ConversationStateRow { customer_phone_normalized: string; updated_at: string }

export async function detectPendingActionAtRisk(): Promise<FindingCandidate[]> {
  const ruleConfig = getDetectionRule('PENDING_ACTION_AT_RISK');
  if (!ruleConfig?.enabled) return [];

  const unassignedThresholdMinutes = envMinutes('OPERATIONAL_UNASSIGNED_MINUTES_THRESHOLD', 30);
  const vendorRespondedThresholdMinutes = envMinutes('OPERATIONAL_VENDOR_RESPONDED_MINUTES_THRESHOLD', 20);
  const now = Date.now();

  const [openCases, recentClosedInquiries] = await Promise.all([
    supabaseSelect<OpenCaseRow>('wati_conversation_state', 'state=eq.NEEDS_HUMAN&select=customer_phone_normalized,handoff_created_at,assigned_role'),
    supabaseSelect<StockInquiryRow>('stock_inquiries', `closed_at=not.is.null&closed_at=gte.${new Date(now - 24 * 60 * 60_000).toISOString()}&select=id,conversation_id,closed_at`),
  ]);

  const unassignedTooLong = openCases.filter(c => !c.assigned_role && c.handoff_created_at && (now - new Date(c.handoff_created_at).getTime()) / 60_000 >= unassignedThresholdMinutes);

  const conversationIds = Array.from(new Set(recentClosedInquiries.map(i => i.conversation_id))).filter(Boolean);
  let staleAfterVendorResponse: StockInquiryRow[] = [];
  if (conversationIds.length > 0) {
    const states = await supabaseSelect<ConversationStateRow>('wati_conversation_state', `customer_phone_normalized=in.(${conversationIds.map(encodeURIComponent).join(',')})&select=customer_phone_normalized,updated_at`);
    const updatedAtByPhone = new Map(states.map(s => [s.customer_phone_normalized, new Date(s.updated_at).getTime()]));
    staleAfterVendorResponse = recentClosedInquiries.filter(i => {
      if (!i.closed_at) return false;
      const closedAtMs = new Date(i.closed_at).getTime();
      if ((now - closedAtMs) / 60_000 < vendorRespondedThresholdMinutes) return false;
      const updatedAtMs = updatedAtByPhone.get(i.conversation_id);
      return updatedAtMs === undefined || updatedAtMs <= closedAtMs;
    });
  }

  const affectedCount = unassignedTooLong.length + staleAfterVendorResponse.length;
  const { breaches, magnitude } = evaluateThreshold(ruleConfig, affectedCount);
  if (!breaches) return [];

  return [{
    category: 'CUSTOMER_SERVICE', type: 'PENDING_ACTION_AT_RISK',
    title: 'Pending customer work may have been forgotten',
    dedupeKey: 'PENDING_ACTION_AT_RISK',
    metricKey: 'pending_action_at_risk',
    currentValue: affectedCount, baselineValue: 0, baselineType: 'CONFIGURED_TARGET',
    evidence: [
      { metricKey: 'unassigned_too_long', label: `Cases unassigned > ${unassignedThresholdMinutes} min`, currentValue: unassignedTooLong.length },
      { metricKey: 'vendor_responded_customer_not_updated', label: `Vendor responses > ${vendorRespondedThresholdMinutes} min old with no conversation activity since`, currentValue: staleAfterVendorResponse.length },
    ],
    confidence: 'HIGH',
    sampleSize: affectedCount,
    magnitude, affectedCount, slaRisk: true,
    recommendedActionType: 'ESCALATE_PENDING_CASES',
    recommendationText: 'Prioritize these conversations for a response and investigate why the workflow did not advance automatically.',
    assignedTeam: ruleConfig.ownerTeam,
    ruleVersion: 1,
  }];
}
