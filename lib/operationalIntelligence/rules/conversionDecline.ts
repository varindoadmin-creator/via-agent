// VIA Customer Operations Phase 10, brief section 13: CONVERSION_DECLINE.
// Reuses Phase 9's getCommercialFunnel directly for both periods.

import type { DateRange } from '../../analytics/periods.ts';
import { getCommercialFunnel } from '../../analytics/funnel.ts';
import { getDetectionRule, evaluateThreshold } from '../detectionRules.ts';
import { hasSufficientSample } from '../samplingGuards.ts';
import type { FindingCandidate } from '../types.ts';

export async function detectConversionDecline(range: DateRange, prevRange: DateRange): Promise<FindingCandidate[]> {
  const ruleConfig = getDetectionRule('CONVERSION_DECLINE');
  if (!ruleConfig?.enabled) return [];

  const [current, previous] = await Promise.all([getCommercialFunnel(range), getCommercialFunnel(prevRange)]);
  if (current.draftToOrderConversion === null || previous.draftToOrderConversion === null) return [];

  const eligibleCount = current.draftsCreated;
  if (!hasSufficientSample(eligibleCount, ruleConfig.minimumSampleSize)) return [];
  if (previous.draftToOrderConversion <= 0) return [];

  const decline = (previous.draftToOrderConversion - current.draftToOrderConversion) / previous.draftToOrderConversion;
  const { breaches, magnitude } = evaluateThreshold(ruleConfig, decline);
  if (!breaches) return [];

  return [{
    category: 'CONVERSION', type: 'CONVERSION_DECLINE',
    title: 'Draft-to-order conversion is declining',
    dedupeKey: 'CONVERSION_DECLINE',
    metricKey: 'draft_to_order_conversion',
    periodStart: range.start.toISOString(), periodEnd: range.end.toISOString(),
    currentValue: current.draftToOrderConversion, baselineValue: previous.draftToOrderConversion, baselineType: 'PREVIOUS_PERIOD',
    absoluteChange: current.draftToOrderConversion - previous.draftToOrderConversion, percentChange: -decline * 100,
    evidence: [
      { metricKey: 'draft_to_order_conversion', label: 'Draft-to-order conversion', currentValue: current.draftToOrderConversion, baselineValue: previous.draftToOrderConversion, comparisonPeriod: 'previous period', sampleSize: eligibleCount },
      { metricKey: 'drafts_created', label: 'Drafts created', currentValue: current.draftsCreated },
      { metricKey: 'orders_created', label: 'Orders created', currentValue: current.ordersCreated },
    ],
    confidence: eligibleCount >= ruleConfig.minimumSampleSize * 2 ? 'HIGH' : 'MEDIUM',
    sampleSize: eligibleCount,
    magnitude, affectedCount: eligibleCount, slaRisk: false,
    recommendedActionType: 'FOLLOW_UP_COMMERCIAL_LEADS',
    recommendationText: 'Review recent drafts that did not convert for a common blocker (stock, price rejection, slow response, or customer non-response) before assuming a single root cause.',
    assignedTeam: ruleConfig.ownerTeam,
    ruleVersion: 1,
  }];
}
