// VIA Customer Operations Phase 10, brief section 27: SYSTEM_RELIABILITY finding
// for Zoho write failures. Reads commercial_approvals directly — status
// FAILED covers both a confirmed failure and an EXECUTION_UNKNOWN outcome
// (lib/commercialApprovals/store.ts's markExecutionUnknown prefixes its
// error text with "EXECUTION_UNKNOWN:"), so both are visible here without
// a new column.

import type { DateRange } from '../../analytics/periods.ts';
import { supabaseSelect } from '../../supabase/rest.ts';
import { getDetectionRule, evaluateThreshold } from '../detectionRules.ts';
import { hasSufficientSample } from '../samplingGuards.ts';
import type { FindingCandidate } from '../types.ts';

interface ApprovalRow { status: string; error: string | null }

export async function detectZohoWriteFailures(range: DateRange): Promise<FindingCandidate[]> {
  const ruleConfig = getDetectionRule('ZOHO_WRITE_FAILURES');
  if (!ruleConfig?.enabled) return [];

  const approvals = await supabaseSelect<ApprovalRow>(
    'commercial_approvals',
    `requested_at=gte.${range.start.toISOString()}&requested_at=lt.${range.end.toISOString()}&select=status,error`,
  );
  const executed = approvals.filter(a => a.status === 'COMPLETED' || a.status === 'FAILED');
  if (!hasSufficientSample(executed.length, ruleConfig.minimumSampleSize)) return [];

  const failed = executed.filter(a => a.status === 'FAILED');
  const unknownOutcome = failed.filter(a => a.error?.startsWith('EXECUTION_UNKNOWN')).length;
  const failureRate = executed.length > 0 ? failed.length / executed.length : 0;
  const { breaches, magnitude } = evaluateThreshold(ruleConfig, failureRate);
  if (!breaches) return [];

  return [{
    category: 'SYSTEM_RELIABILITY', type: 'ZOHO_WRITE_FAILURES',
    title: 'Zoho write failure rate is elevated',
    dedupeKey: 'ZOHO_WRITE_FAILURES',
    metricKey: 'zoho_write_failure_rate',
    periodStart: range.start.toISOString(), periodEnd: range.end.toISOString(),
    currentValue: failureRate, baselineValue: null, baselineType: 'CONFIGURED_TARGET',
    evidence: [
      { metricKey: 'zoho_write_failure_rate', label: 'Failure rate', currentValue: failureRate, sampleSize: executed.length },
      { metricKey: 'zoho_write_failed_count', label: 'Failed executions', currentValue: failed.length },
      { metricKey: 'zoho_write_unknown_outcome_count', label: 'Unknown-outcome (needs manual reconciliation)', currentValue: unknownOutcome },
    ],
    confidence: executed.length >= ruleConfig.minimumSampleSize * 2 ? 'HIGH' : 'MEDIUM',
    sampleSize: executed.length,
    magnitude, affectedCount: failed.length, slaRisk: unknownOutcome > 0,
    recommendedActionType: 'INVESTIGATE_SYSTEM_FAILURE',
    recommendationText: unknownOutcome > 0
      ? `${unknownOutcome} approval(s) have an unconfirmed Zoho outcome and need manual reconciliation — do not retry automatically.`
      : 'Investigate the recent Zoho write failures for a common cause before the backlog of failed approvals grows.',
    assignedTeam: ruleConfig.ownerTeam,
    ruleVersion: 1,
  }];
}
