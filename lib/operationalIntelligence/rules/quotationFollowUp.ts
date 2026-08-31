// VIA Customer Operations Phase 10, brief section 72: QUOTATION_FOLLOW_UP_OPPORTUNITY.
// Detection only — never an automatic customer message (brief's explicit
// instruction; that is Phase 11's territory). Reads commercial_drafts
// directly: a QUOTATION sitting in READY_FOR_REVIEW/WAITING_FOR_APPROVAL
// past the follow-up window with no recent update looks abandoned by the
// customer or forgotten by Sales — either way, worth a human look.

import { supabaseSelect } from '../../supabase/rest.ts';
import { getDetectionRule, evaluateThreshold } from '../detectionRules.ts';
import type { FindingCandidate } from '../types.ts';

function envHours(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

interface DraftRow { id: string; total: number | null; updated_at: string }

export async function detectQuotationFollowUp(): Promise<FindingCandidate[]> {
  const ruleConfig = getDetectionRule('QUOTATION_FOLLOW_UP_OPPORTUNITY');
  if (!ruleConfig?.enabled) return [];

  const windowHours = envHours('OPERATIONAL_QUOTATION_FOLLOWUP_HOURS', 48);
  const cutoff = new Date(Date.now() - windowHours * 60 * 60_000).toISOString();

  const stalled = await supabaseSelect<DraftRow>(
    'commercial_drafts',
    `type=eq.QUOTATION&status=in.(READY_FOR_REVIEW,WAITING_FOR_APPROVAL)&updated_at=lt.${cutoff}&select=id,total,updated_at&limit=200`,
  );

  const { breaches, magnitude } = evaluateThreshold(ruleConfig, stalled.length);
  if (!breaches) return [];

  const totalValue = stalled.reduce((sum, d) => sum + (d.total ?? 0), 0);

  return [{
    category: 'COMMERCIAL_OPPORTUNITY', type: 'QUOTATION_FOLLOW_UP_OPPORTUNITY',
    title: 'Quotations are awaiting follow-up',
    dedupeKey: 'QUOTATION_FOLLOW_UP_OPPORTUNITY',
    metricKey: 'stalled_quotation_count',
    currentValue: stalled.length, baselineValue: 0, baselineType: 'CONFIGURED_TARGET',
    evidence: [
      { metricKey: 'stalled_quotation_count', label: `Quotations idle > ${windowHours}h`, currentValue: stalled.length },
      { metricKey: 'stalled_quotation_value', label: 'Total quotation value (IDR)', currentValue: totalValue },
    ],
    confidence: 'HIGH',
    sampleSize: stalled.length,
    magnitude, affectedCount: stalled.length, slaRisk: false,
    recommendedActionType: 'FOLLOW_UP_COMMERCIAL_LEADS',
    recommendationText: 'Recommend these quotations to Sales/Admin for manual follow-up. Do not send an automatic customer message from this finding.',
    assignedTeam: ruleConfig.ownerTeam,
    ruleVersion: 1,
  }];
}
