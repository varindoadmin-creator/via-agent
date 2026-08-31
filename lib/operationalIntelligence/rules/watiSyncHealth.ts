// VIA Customer Operations Phase 10, brief section 28: WATI_CONTACT_SYNC_HEALTH.
// VIA's own customer_channel_identities mapping remains authoritative
// regardless of sync outcome (brief's explicit "do not treat as
// customer-master corruption") — this finding is about WATI-side sync
// reliability only.

import type { DateRange } from '../../analytics/periods.ts';
import { supabaseSelect } from '../../supabase/rest.ts';
import { getDetectionRule, evaluateThreshold } from '../detectionRules.ts';
import { hasSufficientSample } from '../samplingGuards.ts';
import type { FindingCandidate } from '../types.ts';

interface SyncLogRow { status: string }

export async function detectWatiSyncHealth(range: DateRange): Promise<FindingCandidate[]> {
  const ruleConfig = getDetectionRule('WATI_CONTACT_SYNC_HEALTH');
  if (!ruleConfig?.enabled) return [];

  const attempts = await supabaseSelect<SyncLogRow>(
    'wati_contact_sync_log',
    `attempted_at=gte.${range.start.toISOString()}&attempted_at=lt.${range.end.toISOString()}&select=status`,
  );
  if (!hasSufficientSample(attempts.length, ruleConfig.minimumSampleSize)) return [];

  const failedFinal = attempts.filter(a => a.status === 'SYNC_FAILED_FINAL').length;
  const failureRate = attempts.length > 0 ? failedFinal / attempts.length : 0;
  const { breaches, magnitude } = evaluateThreshold(ruleConfig, failureRate);
  if (!breaches) return [];

  return [{
    category: 'SYSTEM_RELIABILITY', type: 'WATI_CONTACT_SYNC_HEALTH',
    title: 'WATI contact sync failure rate is elevated',
    dedupeKey: 'WATI_CONTACT_SYNC_HEALTH',
    metricKey: 'wati_sync_failure_rate',
    periodStart: range.start.toISOString(), periodEnd: range.end.toISOString(),
    currentValue: failureRate, baselineValue: null, baselineType: 'CONFIGURED_TARGET',
    evidence: [
      { metricKey: 'wati_sync_failure_rate', label: 'Final-failure rate', currentValue: failureRate, sampleSize: attempts.length },
      { metricKey: 'wati_sync_failed_count', label: 'Failed sync attempts', currentValue: failedFinal },
    ],
    confidence: attempts.length >= ruleConfig.minimumSampleSize * 2 ? 'HIGH' : 'MEDIUM',
    sampleSize: attempts.length,
    magnitude, affectedCount: failedFinal, slaRisk: false,
    recommendedActionType: 'INVESTIGATE_SYSTEM_FAILURE',
    recommendationText: 'Investigate WATI contact sync failures. VIA’s own customer mapping remains authoritative and unaffected — this only degrades WATI-side contact attributes.',
    assignedTeam: ruleConfig.ownerTeam,
    ruleVersion: 1,
  }];
}
