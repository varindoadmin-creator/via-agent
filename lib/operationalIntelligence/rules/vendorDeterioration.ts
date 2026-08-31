// VIA Customer Operations Phase 10, brief sections 9-10: VENDOR_RESPONSE_DETERIORATION
// and VENDOR_OOS_DETERIORATION, per vendor (brief section 41's own dedupe
// example: "VENDOR_RESPONSE_DETERIORATION:EDL"). Reuses Phase 9's
// getVendorPerformance directly for both periods.

import type { DateRange } from '../../analytics/periods.ts';
import { getVendorPerformance } from '../../analytics/stockAnalytics.ts';
import { getDetectionRule, evaluateThreshold } from '../detectionRules.ts';
import { hasSufficientSample } from '../samplingGuards.ts';
import type { FindingCandidate } from '../types.ts';

export async function detectVendorDeterioration(range: DateRange, prevRange: DateRange): Promise<FindingCandidate[]> {
  const responseRule = getDetectionRule('VENDOR_RESPONSE_DETERIORATION');
  const oosRule = getDetectionRule('VENDOR_OOS_DETERIORATION');
  if (!responseRule?.enabled && !oosRule?.enabled) return [];

  const [current, previous] = await Promise.all([getVendorPerformance(range), getVendorPerformance(prevRange)]);
  const previousByVendor = new Map(previous.map(v => [v.vendor, v]));

  const candidates: FindingCandidate[] = [];

  for (const vendor of current) {
    const prior = previousByVendor.get(vendor.vendor);
    if (!prior) continue;

    if (responseRule?.enabled && hasSufficientSample(vendor.inquiryCount, responseRule.minimumSampleSize) && prior.medianResponseMinutes > 0) {
      const increase = (vendor.medianResponseMinutes - prior.medianResponseMinutes) / prior.medianResponseMinutes;
      const { breaches, magnitude } = evaluateThreshold(responseRule, increase);
      if (breaches) {
        candidates.push({
          category: 'VENDOR', type: 'VENDOR_RESPONSE_DETERIORATION',
          title: `${vendor.vendor} stock-check response time is deteriorating`,
          dedupeKey: `VENDOR_RESPONSE_DETERIORATION:${vendor.vendor}`,
          metricKey: 'vendor_median_response_minutes', entityType: 'vendor', entityId: vendor.vendor,
          periodStart: range.start.toISOString(), periodEnd: range.end.toISOString(),
          currentValue: vendor.medianResponseMinutes, baselineValue: prior.medianResponseMinutes, baselineType: 'PREVIOUS_PERIOD',
          absoluteChange: vendor.medianResponseMinutes - prior.medianResponseMinutes, percentChange: increase * 100,
          evidence: [
            { metricKey: 'vendor_median_response_minutes', label: 'Median response time (minutes)', currentValue: Math.round(vendor.medianResponseMinutes), baselineValue: Math.round(prior.medianResponseMinutes), comparisonPeriod: 'previous period', sampleSize: vendor.inquiryCount },
            { metricKey: 'stock_inquiry_count', label: 'Stock inquiries', currentValue: vendor.inquiryCount },
          ],
          confidence: vendor.inquiryCount >= responseRule.minimumSampleSize * 2 ? 'HIGH' : 'MEDIUM',
          sampleSize: vendor.inquiryCount,
          magnitude, affectedCount: vendor.inquiryCount, slaRisk: true,
          recommendedActionType: 'REVIEW_VENDOR_PROCESS',
          recommendationText: `Review ${vendor.vendor}'s stock-response process and consider earlier escalation for unanswered checks.`,
          assignedTeam: responseRule.ownerTeam,
          ruleVersion: 1,
        });
      }
    }

    if (oosRule?.enabled && vendor.oosRate !== null && prior.oosRate !== null && hasSufficientSample(vendor.inquiryCount, oosRule.minimumSampleSize) && prior.oosRate > 0) {
      const increase = (vendor.oosRate - prior.oosRate) / prior.oosRate;
      const { breaches, magnitude } = evaluateThreshold(oosRule, increase);
      if (breaches) {
        candidates.push({
          category: 'VENDOR', type: 'VENDOR_OOS_DETERIORATION',
          title: `${vendor.vendor} out-of-stock rate is rising`,
          dedupeKey: `VENDOR_OOS_DETERIORATION:${vendor.vendor}`,
          metricKey: 'vendor_oos_rate', entityType: 'vendor', entityId: vendor.vendor,
          periodStart: range.start.toISOString(), periodEnd: range.end.toISOString(),
          currentValue: vendor.oosRate, baselineValue: prior.oosRate, baselineType: 'PREVIOUS_PERIOD',
          absoluteChange: vendor.oosRate - prior.oosRate, percentChange: increase * 100,
          evidence: [
            { metricKey: 'vendor_oos_rate', label: 'OOS rate', currentValue: vendor.oosRate, baselineValue: prior.oosRate, comparisonPeriod: 'previous period', sampleSize: vendor.inquiryCount },
          ],
          confidence: vendor.inquiryCount >= oosRule.minimumSampleSize * 2 ? 'HIGH' : 'MEDIUM',
          sampleSize: vendor.inquiryCount,
          magnitude, affectedCount: vendor.inquiryCount, slaRisk: false,
          recommendedActionType: 'REVIEW_VENDOR_PROCESS',
          recommendationText: `Observed: ${vendor.vendor}'s OOS rate increased. Possible implication: customers may face lower fulfilment availability. Recommendation: review demand pattern and availability with the vendor — do not conclude a procurement failure without further evidence.`,
          assignedTeam: oosRule.ownerTeam,
          ruleVersion: 1,
        });
      }
    }
  }

  return candidates;
}
