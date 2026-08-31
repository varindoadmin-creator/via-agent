// VIA Customer Operations Phase 10, brief section 7: CUSTOMER_SERVICE_BACKLOG_RISK.
// A point-in-time snapshot (open/unassigned case counts, oldest case age) —
// no historical backlog-size series exists to compare against, so this is an
// absolute-threshold rule, not a period-over-period one (documented choice).

import { supabaseSelect } from '../../supabase/rest.ts';
import { getDetectionRule, evaluateThreshold } from '../detectionRules.ts';
import type { FindingCandidate } from '../types.ts';

interface OpenCaseRow { customer_phone_normalized: string; assigned_role: string | null; handoff_created_at: string | null }

export async function detectBacklogRisk(): Promise<FindingCandidate[]> {
  const ruleConfig = getDetectionRule('CUSTOMER_SERVICE_BACKLOG_RISK');
  if (!ruleConfig?.enabled) return [];

  const openCases = await supabaseSelect<OpenCaseRow>(
    'wati_conversation_state',
    'state=in.(NEEDS_HUMAN,HUMAN_ASSIGNED,HUMAN_ACTIVE)&select=customer_phone_normalized,assigned_role,handoff_created_at',
  );

  const openCount = openCases.length;
  const { breaches, magnitude } = evaluateThreshold(ruleConfig, openCount);
  if (!breaches) return [];

  const unassignedCount = openCases.filter(c => !c.assigned_role).length;
  const ages = openCases.filter(c => c.handoff_created_at).map(c => (Date.now() - new Date(c.handoff_created_at as string).getTime()) / 60_000);
  const oldestAgeMinutes = ages.length ? Math.max(...ages) : 0;
  const medianAgeMinutes = ages.length ? [...ages].sort((a, b) => a - b)[Math.floor(ages.length / 2)] : 0;

  return [{
    category: 'CUSTOMER_SERVICE', type: 'CUSTOMER_SERVICE_BACKLOG_RISK',
    title: 'Customer Service backlog is rising',
    dedupeKey: 'CUSTOMER_SERVICE_BACKLOG_RISK',
    metricKey: 'backlog',
    currentValue: openCount, baselineValue: ruleConfig.warningThreshold, baselineType: 'CONFIGURED_TARGET',
    evidence: [
      { metricKey: 'backlog', label: 'Open cases', currentValue: openCount },
      { metricKey: 'unassigned_backlog', label: 'Unassigned cases', currentValue: unassignedCount },
      { metricKey: 'oldest_case_age_minutes', label: 'Oldest case age (minutes)', currentValue: Math.round(oldestAgeMinutes) },
      { metricKey: 'median_case_age_minutes', label: 'Median case age (minutes)', currentValue: Math.round(medianAgeMinutes) },
    ],
    confidence: 'HIGH',
    sampleSize: openCount,
    magnitude, affectedCount: openCount, slaRisk: unassignedCount > 0,
    recommendedActionType: 'REVIEW_STAFFING',
    recommendationText: 'Review current assignment coverage — a rising, increasingly unassigned backlog usually means volume is outpacing available response capacity.',
    assignedTeam: ruleConfig.ownerTeam,
    ruleVersion: 1,
  }];
}
