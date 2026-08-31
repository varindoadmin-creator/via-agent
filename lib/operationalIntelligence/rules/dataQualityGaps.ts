// VIA Customer Operations Phase 10, brief section 32: data-quality findings.
// Reuses Phase 9's getDataQualityCoverage directly for the three coverage
// metrics it already tracks (attribution, customer mapping, order linkage).
// PRODUCT_MASTER_GAP (missing brand/price coverage) is not built this pass —
// no such coverage metric exists yet in Phase 9's data-quality module
// (documented limitation, not fabricated).

import type { DateRange } from '../../analytics/periods.ts';
import { getDataQualityCoverage } from '../../analytics/dataQuality.ts';
import { getDetectionRule, evaluateThreshold } from '../detectionRules.ts';
import type { FindingCandidate } from '../types.ts';

const CHECKS: Array<{ key: string; type: string; metricKey: 'attributionCoverage' | 'customerMappingCoverage' | 'orderLinkageCoverage'; label: string; actionType: FindingCandidate['recommendedActionType'] }> = [
  { key: 'ATTRIBUTION_COVERAGE_GAP', type: 'ATTRIBUTION_COVERAGE_GAP', metricKey: 'attributionCoverage', label: 'Source attribution coverage', actionType: 'CLEAN_CUSTOMER_MAPPING' },
  { key: 'CUSTOMER_MAPPING_GAP', type: 'CUSTOMER_MAPPING_GAP', metricKey: 'customerMappingCoverage', label: 'Customer mapping coverage', actionType: 'CLEAN_CUSTOMER_MAPPING' },
  { key: 'ORDER_LINKAGE_GAP', type: 'ORDER_LINKAGE_GAP', metricKey: 'orderLinkageCoverage', label: 'Order linkage coverage', actionType: 'CLEAN_CUSTOMER_MAPPING' },
];

export async function detectDataQualityGaps(range: DateRange): Promise<FindingCandidate[]> {
  const ruleConfig = getDetectionRule('DATA_QUALITY_GAP');
  if (!ruleConfig?.enabled) return [];

  const coverage = await getDataQualityCoverage(range);
  const candidates: FindingCandidate[] = [];

  for (const check of CHECKS) {
    const value = coverage[check.metricKey];
    if (value === null) continue; // no denominator this period — nothing to alert on
    const gap = 1 - value;
    const { breaches, magnitude } = evaluateThreshold(ruleConfig, gap);
    if (!breaches) continue;

    candidates.push({
      category: 'DATA_QUALITY', type: check.type,
      title: `${check.label} is low`,
      dedupeKey: check.key,
      metricKey: check.metricKey,
      periodStart: range.start.toISOString(), periodEnd: range.end.toISOString(),
      currentValue: value, baselineValue: null, baselineType: 'CONFIGURED_TARGET',
      evidence: [{ metricKey: check.metricKey, label: check.label, currentValue: value }],
      // Brief section 70: low coverage itself caps confidence — this finding names a
      // measurement gap, it is never the basis for a confident downstream comparison.
      confidence: value < 0.5 ? 'LOW' : 'MEDIUM',
      sampleSize: 0,
      magnitude, affectedCount: 0, slaRisk: false,
      recommendedActionType: check.actionType,
      recommendationText: `${check.label} is at ${(value * 100).toFixed(0)}% — downstream comparisons using this dimension should be treated cautiously until coverage improves.`,
      assignedTeam: ruleConfig.ownerTeam,
      ruleVersion: 1,
    });
  }
  return candidates;
}
