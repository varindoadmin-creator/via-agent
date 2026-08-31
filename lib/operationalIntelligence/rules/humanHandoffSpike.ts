// VIA Customer Operations Phase 10, brief section 23: HUMAN_HANDOFF_SPIKE.
// Material increase in handoff rate — explicitly does NOT conclude "Jarvis
// quality worsened" (brief's own instruction); the recommendation always
// targets whatever the dominant handoff reason actually is.

import type { DateRange } from '../../analytics/periods.ts';
import { getCustomerServiceFunnel, getHandoffReasonBreakdown } from '../../analytics/customerServiceAnalytics.ts';
import { getDetectionRule, evaluateThreshold } from '../detectionRules.ts';
import { hasSufficientSample } from '../samplingGuards.ts';
import type { FindingCandidate } from '../types.ts';

export async function detectHumanHandoffSpike(range: DateRange, prevRange: DateRange): Promise<FindingCandidate[]> {
  const ruleConfig = getDetectionRule('HUMAN_HANDOFF_SPIKE');
  if (!ruleConfig?.enabled) return [];

  const [current, previous, reasons] = await Promise.all([
    getCustomerServiceFunnel(range), getCustomerServiceFunnel(prevRange), getHandoffReasonBreakdown(range),
  ]);
  if (current.humanHandoffRate === null || previous.humanHandoffRate === null) return [];
  if (!hasSufficientSample(current.inboundConversations, ruleConfig.minimumSampleSize)) return [];
  if (previous.humanHandoffRate <= 0) return [];

  const increase = (current.humanHandoffRate - previous.humanHandoffRate) / previous.humanHandoffRate;
  const { breaches, magnitude } = evaluateThreshold(ruleConfig, increase);
  if (!breaches) return [];

  const topReason = reasons[0];
  const actionType = topReason?.reason === 'PRICE_NOT_FOUND' || topReason?.reason === 'PRICE_CONFLICT' ? 'FIX_PRICE_SOURCE'
    : topReason?.reason === 'DELIVERY_STATUS_UNAVAILABLE' ? 'IMPROVE_PRODUCT_METADATA'
    : 'REVIEW_STAFFING';

  return [{
    category: 'CUSTOMER_SERVICE', type: 'HUMAN_HANDOFF_SPIKE',
    title: 'Human handoff rate has increased materially',
    dedupeKey: 'HUMAN_HANDOFF_SPIKE',
    metricKey: 'human_handoff_rate',
    periodStart: range.start.toISOString(), periodEnd: range.end.toISOString(),
    currentValue: current.humanHandoffRate, baselineValue: previous.humanHandoffRate, baselineType: 'PREVIOUS_PERIOD',
    absoluteChange: current.humanHandoffRate - previous.humanHandoffRate, percentChange: increase * 100,
    evidence: [
      { metricKey: 'human_handoff_rate', label: 'Human handoff rate', currentValue: current.humanHandoffRate, baselineValue: previous.humanHandoffRate, comparisonPeriod: 'previous period', sampleSize: current.inboundConversations },
      ...(topReason ? [{ metricKey: 'top_handoff_reason', label: `Most common reason: ${topReason.reason}`, currentValue: topReason.count }] : []),
    ],
    confidence: current.inboundConversations >= ruleConfig.minimumSampleSize * 2 ? 'HIGH' : 'MEDIUM',
    sampleSize: current.inboundConversations,
    magnitude, affectedCount: current.handoffCount, slaRisk: false,
    recommendedActionType: actionType,
    recommendationText: topReason
      ? `Most of the increase is associated with ${topReason.reason.replace(/_/g, ' ').toLowerCase()} — target that specific gap rather than assuming a general drop in automation quality.`
      : 'Break down the recent handoff reasons before assuming a general drop in automation quality.',
    assignedTeam: ruleConfig.ownerTeam,
    ruleVersion: 1,
  }];
}
