// VIA Customer Operations Phase 10, brief sections 11, 79, 104: HIGH_DEMAND_LOW_AVAILABILITY —
// the flagship commercial-opportunity example. Reads stock_inquiries
// directly (Phase 9's stockAnalytics.ts aggregates fleet-wide, not
// per-product, so this rule adds its own narrow per-item_code grouping over
// the same table — never a raw quantity, only inquiry counts and rates,
// preserving Phase 3's confidentiality boundary). Never recommends a
// purchase quantity — only flags the product for a human stocking review.

import type { DateRange } from '../../analytics/periods.ts';
import { supabaseSelect } from '../../supabase/rest.ts';
import { getDetectionRule, evaluateThreshold } from '../detectionRules.ts';
import { hasSufficientSample } from '../samplingGuards.ts';
import type { FindingCandidate } from '../types.ts';

interface StockInquiryRow { item_code: string | null; final_availability: string | null }

const TOP_PERCENTILE_RANK = 0.95; // "top 5%" by inquiry volume, per brief section 11's example

export async function detectHighDemandLowAvailability(range: DateRange): Promise<FindingCandidate[]> {
  const ruleConfig = getDetectionRule('HIGH_DEMAND_LOW_AVAILABILITY');
  if (!ruleConfig?.enabled) return [];

  const inquiries = await supabaseSelect<StockInquiryRow>(
    'stock_inquiries',
    `created_at=gte.${range.start.toISOString()}&created_at=lt.${range.end.toISOString()}&item_code=not.is.null&select=item_code,final_availability&limit=5000`,
  );
  if (inquiries.length === 0) return [];

  const byProduct = new Map<string, StockInquiryRow[]>();
  for (const row of inquiries) {
    const code = row.item_code as string;
    if (!byProduct.has(code)) byProduct.set(code, []);
    byProduct.get(code)!.push(row);
  }

  const volumeThresholdIndex = Math.floor(byProduct.size * TOP_PERCENTILE_RANK);
  const countsSorted = Array.from(byProduct.values()).map(rows => rows.length).sort((a, b) => a - b);
  const volumeThreshold = countsSorted[Math.min(volumeThresholdIndex, countsSorted.length - 1)] ?? 0;

  const candidates: FindingCandidate[] = [];
  for (const [code, rows] of byProduct.entries()) {
    if (rows.length < volumeThreshold || !hasSufficientSample(rows.length, ruleConfig.minimumSampleSize)) continue;
    const unavailable = rows.filter(r => r.final_availability === 'OUT_OF_STOCK' || r.final_availability === 'INSUFFICIENT').length;
    const oosRate = unavailable / rows.length;
    const { breaches, magnitude } = evaluateThreshold(ruleConfig, oosRate);
    if (!breaches) continue;

    candidates.push({
      category: 'PRODUCT', type: 'HIGH_DEMAND_LOW_AVAILABILITY',
      title: `${code} has high demand but frequent unavailability`,
      dedupeKey: `HIGH_DEMAND_LOW_AVAILABILITY:${code}`,
      metricKey: 'product_oos_rate', entityType: 'product', entityId: code,
      periodStart: range.start.toISOString(), periodEnd: range.end.toISOString(),
      currentValue: oosRate, baselineValue: null, baselineType: 'CONFIGURED_TARGET',
      evidence: [
        { metricKey: 'inquiry_count', label: 'Stock inquiries this period', currentValue: rows.length },
        { metricKey: 'product_oos_rate', label: 'Out-of-stock/insufficient rate', currentValue: oosRate, sampleSize: rows.length },
      ],
      confidence: rows.length >= ruleConfig.minimumSampleSize * 2 ? 'HIGH' : 'MEDIUM',
      sampleSize: rows.length,
      magnitude, affectedCount: rows.length, slaRisk: false,
      recommendedActionType: 'REVIEW_STOCKING_STRATEGY',
      recommendationText: `Review supply availability and whether ${code} should receive different inventory/vendor planning treatment — demand appears commercially strong. Do not prescribe an exact purchase quantity from this finding alone.`,
      assignedTeam: ruleConfig.ownerTeam,
      ruleVersion: 1,
    });
  }
  return candidates;
}
