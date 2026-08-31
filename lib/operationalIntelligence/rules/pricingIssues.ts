// VIA Customer Operations Phase 10, brief sections 16-17: PRICING_COVERAGE_GAP
// and PRICING_SOURCE_CONFLICT. PRICING_COVERAGE_GAP reads wati_messages'
// existing response_type values ('PRICE_NOT_FOUND'/'COMMERCIAL_PRICE_NOT_FOUND')
// directly — no new tracking needed. PRICING_SOURCE_CONFLICT reads
// wati_conversation_state handoff_reason='PRICE_CONFLICT' counts; that reason
// is declared in Phase 8's enum but not yet triggered by any live code path,
// so this rule will report zero until/unless a future phase wires that
// trigger up — it is real data, not fabricated, and will start working
// automatically the moment that trigger exists.

import type { DateRange } from '../../analytics/periods.ts';
import { supabaseSelect } from '../../supabase/rest.ts';
import { getDetectionRule, evaluateThreshold } from '../detectionRules.ts';
import type { FindingCandidate } from '../types.ts';

interface MessageRow { response_type: string | null }
interface HandoffRow { handoff_reason: string | null }

const PRICE_NOT_FOUND_TYPES = ['PRICE_NOT_FOUND', 'COMMERCIAL_PRICE_NOT_FOUND'];

export async function detectPricingIssues(range: DateRange): Promise<FindingCandidate[]> {
  const coverageRule = getDetectionRule('PRICING_COVERAGE_GAP');
  const conflictRule = getDetectionRule('PRICING_SOURCE_CONFLICT');
  const candidates: FindingCandidate[] = [];

  if (coverageRule?.enabled) {
    const messages = await supabaseSelect<MessageRow>(
      'wati_messages',
      `received_at=gte.${range.start.toISOString()}&received_at=lt.${range.end.toISOString()}&direction=eq.INBOUND&select=response_type`,
    );
    const notFoundCount = messages.filter(m => m.response_type && PRICE_NOT_FOUND_TYPES.includes(m.response_type)).length;
    const { breaches, magnitude } = evaluateThreshold(coverageRule, notFoundCount);
    if (breaches) {
      candidates.push({
        category: 'PRICING', type: 'PRICING_COVERAGE_GAP',
        title: 'Repeated price lookups could not be resolved automatically',
        dedupeKey: 'PRICING_COVERAGE_GAP',
        metricKey: 'price_not_found_count',
        periodStart: range.start.toISOString(), periodEnd: range.end.toISOString(),
        currentValue: notFoundCount, baselineValue: null, baselineType: 'CONFIGURED_TARGET',
        evidence: [{ metricKey: 'price_not_found_count', label: 'Customer price inquiries not resolved', currentValue: notFoundCount, sampleSize: messages.length }],
        confidence: 'HIGH',
        sampleSize: notFoundCount,
        magnitude, affectedCount: notFoundCount, slaRisk: false,
        recommendedActionType: 'FIX_PRICE_SOURCE',
        recommendationText: 'Review pricing source coverage for the affected product codes.',
        assignedTeam: coverageRule.ownerTeam,
        ruleVersion: 1,
      });
    }
  }

  if (conflictRule?.enabled) {
    const handoffs = await supabaseSelect<HandoffRow>(
      'wati_conversation_state',
      `handoff_created_at=gte.${range.start.toISOString()}&handoff_created_at=lt.${range.end.toISOString()}&handoff_reason=eq.PRICE_CONFLICT&select=handoff_reason`,
    );
    const { breaches, magnitude } = evaluateThreshold(conflictRule, handoffs.length);
    if (breaches) {
      candidates.push({
        category: 'PRICING', type: 'PRICING_SOURCE_CONFLICT',
        title: 'Repeated conflicting price sources detected',
        dedupeKey: 'PRICING_SOURCE_CONFLICT',
        metricKey: 'price_conflict_count',
        periodStart: range.start.toISOString(), periodEnd: range.end.toISOString(),
        currentValue: handoffs.length, baselineValue: null, baselineType: 'CONFIGURED_TARGET',
        evidence: [{ metricKey: 'price_conflict_count', label: 'Price-conflict handoffs', currentValue: handoffs.length }],
        confidence: 'HIGH',
        sampleSize: handoffs.length,
        magnitude, affectedCount: handoffs.length, slaRisk: true,
        recommendedActionType: 'FIX_PRICE_SOURCE',
        recommendationText: 'Investigate and reconcile the conflicting price sources — VIA never auto-selects a price when sources disagree.',
        assignedTeam: conflictRule.ownerTeam,
        ruleVersion: 1,
      });
    }
  }

  return candidates;
}
