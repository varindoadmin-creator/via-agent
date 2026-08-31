// VIA Customer Operations Phase 10, brief section 26: APPROVED_TRANSACTION_NOT_EXECUTED —
// a critical operational exception, higher severity per the brief. Reads
// commercial_drafts directly: APPROVED means an admin already signed off,
// EXECUTING means the write started but never confirmed — both stuck states
// mean the customer's approved order/quotation is not actually in Zoho yet.

import { supabaseSelect } from '../../supabase/rest.ts';
import { getDetectionRule, evaluateThreshold } from '../detectionRules.ts';
import type { FindingCandidate } from '../types.ts';

function envMinutes(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

interface DraftRow { id: string; type: string; status: string; total: number | null; updated_at: string }

export async function detectApprovedNotExecuted(): Promise<FindingCandidate[]> {
  const ruleConfig = getDetectionRule('APPROVED_TRANSACTION_NOT_EXECUTED');
  if (!ruleConfig?.enabled) return [];

  const thresholdMinutes = envMinutes('OPERATIONAL_APPROVED_NOT_EXECUTED_MINUTES', 60);
  const cutoff = new Date(Date.now() - thresholdMinutes * 60_000).toISOString();

  const drafts = await supabaseSelect<DraftRow>(
    'commercial_drafts',
    `status=in.(APPROVED,EXECUTING)&updated_at=lt.${cutoff}&select=id,type,status,total,updated_at&order=updated_at.asc&limit=200`,
  );

  const { breaches, magnitude } = evaluateThreshold(ruleConfig, drafts.length);
  if (!breaches) return [];

  const totalValue = drafts.reduce((sum, d) => sum + (d.total ?? 0), 0);
  const oldestMinutes = drafts.length ? Math.round((Date.now() - new Date(drafts[0].updated_at).getTime()) / 60_000) : 0;

  return [{
    category: 'ORDER_PROCESSING', type: 'APPROVED_TRANSACTION_NOT_EXECUTED',
    title: 'Approved orders/quotations remain unexecuted in Zoho',
    dedupeKey: 'APPROVED_TRANSACTION_NOT_EXECUTED',
    metricKey: 'approved_not_executed_count',
    currentValue: drafts.length, baselineValue: 0, baselineType: 'CONFIGURED_TARGET',
    evidence: [
      { metricKey: 'approved_not_executed_count', label: `Drafts approved/executing > ${thresholdMinutes} min`, currentValue: drafts.length },
      { metricKey: 'approved_not_executed_value', label: 'Total draft value (IDR)', currentValue: totalValue },
      { metricKey: 'oldest_stuck_minutes', label: 'Oldest stuck draft (minutes)', currentValue: oldestMinutes },
    ],
    confidence: 'HIGH',
    sampleSize: drafts.length,
    magnitude, affectedCount: drafts.length, slaRisk: true,
    recommendedActionType: 'INVESTIGATE_SYSTEM_FAILURE',
    recommendationText: 'Review these approved drafts and confirm whether Zoho execution failed silently or is simply waiting — do not retry automatically; reconcile manually per the existing approval-execution safeguards.',
    assignedTeam: ruleConfig.ownerTeam,
    ruleVersion: 1,
  }];
}
