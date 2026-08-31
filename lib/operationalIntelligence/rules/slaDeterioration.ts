// VIA Customer Operations Phase 10, brief section 6: CUSTOMER_SERVICE_SLA_DETERIORATION.
// Reuses Phase 9's getCustomerServiceFunnel directly — never a duplicate SLA calculation.

import type { DateRange } from '../../analytics/periods.ts';
import { getCustomerServiceFunnel } from '../../analytics/customerServiceAnalytics.ts';
import { getDetectionRule, evaluateThreshold } from '../detectionRules.ts';
import { hasSufficientSample } from '../samplingGuards.ts';
import type { FindingCandidate } from '../types.ts';

export async function detectSlaDeterioration(range: DateRange, prevRange: DateRange): Promise<FindingCandidate[]> {
  const ruleConfig = getDetectionRule('CUSTOMER_SERVICE_SLA_DETERIORATION');
  if (!ruleConfig?.enabled) return [];

  const [current, previous] = await Promise.all([getCustomerServiceFunnel(range), getCustomerServiceFunnel(prevRange)]);
  if (current.slaCompliance === null || previous.slaCompliance === null) return [];
  if (!hasSufficientSample(current.handoffCount, ruleConfig.minimumSampleSize)) return [];

  const decline = previous.slaCompliance > 0 ? (previous.slaCompliance - current.slaCompliance) / previous.slaCompliance : 0;
  const { breaches, magnitude } = evaluateThreshold(ruleConfig, decline);
  if (!breaches) return [];

  return [{
    category: 'CUSTOMER_SERVICE', type: 'CUSTOMER_SERVICE_SLA_DETERIORATION',
    title: 'Customer Service SLA compliance is deteriorating',
    dedupeKey: 'CUSTOMER_SERVICE_SLA_DETERIORATION',
    metricKey: 'sla_compliance',
    periodStart: range.start.toISOString(), periodEnd: range.end.toISOString(),
    currentValue: current.slaCompliance, baselineValue: previous.slaCompliance, baselineType: 'PREVIOUS_PERIOD',
    absoluteChange: current.slaCompliance - previous.slaCompliance, percentChange: -decline * 100,
    evidence: [
      { metricKey: 'sla_compliance', label: 'SLA compliance', currentValue: current.slaCompliance, baselineValue: previous.slaCompliance, comparisonPeriod: 'previous period', sampleSize: current.handoffCount },
      { metricKey: 'handoff_count', label: 'Handoffs evaluated', currentValue: current.handoffCount, sampleSize: current.handoffCount },
    ],
    confidence: current.handoffCount >= ruleConfig.minimumSampleSize * 2 ? 'HIGH' : 'MEDIUM',
    sampleSize: current.handoffCount,
    magnitude, affectedCount: current.handoffCount, slaRisk: true,
    recommendedActionType: 'ADJUST_SLA_RULE',
    recommendationText: 'Review current staffing/assignment coverage against handoff volume, and confirm the SLA threshold still reflects an achievable target.',
    assignedTeam: ruleConfig.ownerTeam,
    ruleVersion: 1,
  }];
}
