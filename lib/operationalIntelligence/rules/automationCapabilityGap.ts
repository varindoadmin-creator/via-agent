// VIA Customer Operations Phase 10, brief section 75: AUTOMATION_CAPABILITY_GAP —
// intents handed to a human because automation lacks a capability (not a
// policy choice like discount approval). Reuses Phase 9's
// getHandoffReasonBreakdown; only reasons that represent a missing
// capability are considered.

import type { DateRange } from '../../analytics/periods.ts';
import { getHandoffReasonBreakdown, getCustomerServiceFunnel } from '../../analytics/customerServiceAnalytics.ts';
import { getDetectionRule, evaluateThreshold } from '../detectionRules.ts';
import { hasSufficientSample } from '../samplingGuards.ts';
import type { FindingCandidate } from '../types.ts';

const CAPABILITY_GAP_REASONS = new Set(['DELIVERY_STATUS_UNAVAILABLE', 'AI_UNAVAILABLE']);

export async function detectAutomationCapabilityGap(range: DateRange): Promise<FindingCandidate[]> {
  const ruleConfig = getDetectionRule('AUTOMATION_CAPABILITY_GAP');
  if (!ruleConfig?.enabled) return [];

  const [breakdown, funnel] = await Promise.all([getHandoffReasonBreakdown(range), getCustomerServiceFunnel(range)]);
  if (!hasSufficientSample(funnel.inboundConversations, ruleConfig.minimumSampleSize)) return [];

  const candidates: FindingCandidate[] = [];
  for (const entry of breakdown) {
    if (!CAPABILITY_GAP_REASONS.has(entry.reason)) continue;
    const share = funnel.inboundConversations > 0 ? entry.count / funnel.inboundConversations : 0;
    const { breaches, magnitude } = evaluateThreshold(ruleConfig, share);
    if (!breaches) continue;

    candidates.push({
      category: 'CUSTOMER_SERVICE', type: 'AUTOMATION_CAPABILITY_GAP',
      title: `${entry.reason.replace(/_/g, ' ').toLowerCase()} repeatedly requires a human`,
      dedupeKey: `AUTOMATION_CAPABILITY_GAP:${entry.reason}`,
      metricKey: 'capability_gap_share', entityType: 'handoff_reason', entityId: entry.reason,
      periodStart: range.start.toISOString(), periodEnd: range.end.toISOString(),
      currentValue: share, baselineValue: null, baselineType: 'CONFIGURED_TARGET',
      evidence: [
        { metricKey: 'capability_gap_count', label: `${entry.reason} handoffs`, currentValue: entry.count, sampleSize: funnel.inboundConversations },
        { metricKey: 'capability_gap_share', label: 'Share of inbound conversations', currentValue: share },
      ],
      confidence: entry.count >= ruleConfig.minimumSampleSize * 2 ? 'HIGH' : 'MEDIUM',
      sampleSize: entry.count,
      magnitude, affectedCount: entry.count, slaRisk: false,
      recommendedActionType: entry.reason === 'DELIVERY_STATUS_UNAVAILABLE' ? 'IMPROVE_PRODUCT_METADATA' : 'INVESTIGATE_SYSTEM_FAILURE',
      recommendationText: entry.reason === 'DELIVERY_STATUS_UNAVAILABLE'
        ? 'Prioritize integration with an authoritative logistics/delivery-status source — this handoff volume reflects a missing capability, not an AI quality issue.'
        : 'Investigate why automated responses were unavailable for this volume of conversations.',
      assignedTeam: ruleConfig.ownerTeam,
      ruleVersion: 1,
    });
  }
  return candidates;
}
