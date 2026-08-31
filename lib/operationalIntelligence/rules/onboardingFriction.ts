// VIA Customer Operations Phase 10, brief section 19: CUSTOMER_ONBOARDING_FRICTION.
// Reuses Phase 9's getOnboardingFunnel directly.

import type { DateRange } from '../../analytics/periods.ts';
import { getOnboardingFunnel } from '../../analytics/onboardingAnalytics.ts';
import { getDetectionRule, evaluateThreshold } from '../detectionRules.ts';
import { hasSufficientSample } from '../samplingGuards.ts';
import type { FindingCandidate } from '../types.ts';

export async function detectOnboardingFriction(range: DateRange): Promise<FindingCandidate[]> {
  const ruleConfig = getDetectionRule('CUSTOMER_ONBOARDING_FRICTION');
  if (!ruleConfig?.enabled) return [];

  const funnel = await getOnboardingFunnel(range);
  if (!hasSufficientSample(funnel.onboardingStarted, ruleConfig.minimumSampleSize)) return [];

  const abandonmentRate = funnel.onboardingStarted > 0 ? funnel.onboardingAbandoned / funnel.onboardingStarted : 0;
  const { breaches, magnitude } = evaluateThreshold(ruleConfig, abandonmentRate);
  if (!breaches) return [];

  return [{
    category: 'CUSTOMER_ONBOARDING', type: 'CUSTOMER_ONBOARDING_FRICTION',
    title: 'Customer onboarding abandonment is elevated',
    dedupeKey: 'CUSTOMER_ONBOARDING_FRICTION',
    metricKey: 'onboarding_abandonment_rate',
    periodStart: range.start.toISOString(), periodEnd: range.end.toISOString(),
    currentValue: abandonmentRate, baselineValue: null, baselineType: 'CONFIGURED_TARGET',
    evidence: [
      { metricKey: 'onboarding_started', label: 'Onboarding started', currentValue: funnel.onboardingStarted },
      { metricKey: 'onboarding_abandoned', label: 'Abandoned before customer creation', currentValue: funnel.onboardingAbandoned },
      { metricKey: 'duplicate_detected', label: 'Flagged as possible duplicate', currentValue: funnel.duplicateDetected },
    ],
    confidence: funnel.onboardingStarted >= ruleConfig.minimumSampleSize * 2 ? 'HIGH' : 'MEDIUM',
    sampleSize: funnel.onboardingStarted,
    magnitude, affectedCount: funnel.onboardingAbandoned, slaRisk: false,
    recommendedActionType: 'CLEAN_CUSTOMER_MAPPING',
    recommendationText: 'Review recent abandoned onboarding drafts for a common blocker (missing company/billing details, NPWP step, duplicate review, or approval delay).',
    assignedTeam: ruleConfig.ownerTeam,
    ruleVersion: 1,
  }];
}
