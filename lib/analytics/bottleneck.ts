// ─── Bottleneck analysis & recommendations ───────────────────────────────────
// VIA Customer Operations Phase 9, brief sections 50, 76-79, 104-105: every
// insight is explicitly separated into FACT (an observed metric change),
// DIAGNOSIS (which component drives it, grounded in real decomposition
// data), and RECOMMENDATION (a suggested action, never presented as fact).
// Confidence is grounded in real data-quality signals, never faked.

import { comparePeriods } from './periods.ts';
import type { WaitingTimeBreakdown } from './waitingTimeBreakdown.ts';

export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface BottleneckInsight {
  fact: string;
  diagnosis: string;
  recommendation: string;
  confidence: Confidence;
  smallSample: boolean;
}

/** Brief sections 50, 97, 104: decomposes a resolution-time change into its vendor/internal/customer drivers. */
export function analyzeResolutionTimeBottleneck(current: WaitingTimeBreakdown, previous: WaitingTimeBreakdown): BottleneckInsight | null {
  const totalChange = comparePeriods(current.totalMinutes, previous.totalMinutes);
  if (totalChange.percentChange === null || Math.abs(totalChange.percentChange) < 5) return null; // not a meaningful change worth reporting

  const vendorChange = comparePeriods(current.vendorMinutes, previous.vendorMinutes);
  const internalChange = comparePeriods(current.internalMinutes, previous.internalMinutes);
  const customerChange = comparePeriods(current.customerMinutes, previous.customerMinutes);

  const deltas = [
    { label: 'Vendor Waiting', minutes: current.vendorMinutes - previous.vendorMinutes, change: vendorChange },
    { label: 'Internal Waiting', minutes: current.internalMinutes - previous.internalMinutes, change: internalChange },
    { label: 'Customer Waiting', minutes: current.customerMinutes - previous.customerMinutes, change: customerChange },
  ].sort((a, b) => Math.abs(b.minutes) - Math.abs(a.minutes));

  const primaryDriver = deltas[0];
  const direction = totalChange.percentChange > 0 ? 'increased' : 'decreased';
  const fact = `Average resolution time ${direction} ${Math.abs(Math.round(totalChange.percentChange))}%.`;
  const diagnosis = `This is mainly driven by ${primaryDriver.label.toLowerCase()} (${primaryDriver.minutes >= 0 ? '+' : ''}${Math.round(primaryDriver.minutes)} minutes).`;

  let recommendation: string;
  if (primaryDriver.label === 'Vendor Waiting') {
    recommendation = 'Review response SLA/process with the vendor, or add an earlier escalation trigger.';
  } else if (primaryDriver.label === 'Internal Waiting') {
    recommendation = 'Review the internal approval/review step causing the delay (Sales/Finance turnaround).';
  } else {
    recommendation = 'Consider a bounded, business-hour-aware reminder for customers who have gone quiet mid-workflow.';
  }

  const smallSample = totalChange.smallSample;
  const confidence: Confidence = smallSample ? 'LOW' : (current.totalMinutes > 0 && previous.totalMinutes > 0 ? 'HIGH' : 'MEDIUM');

  return { fact, diagnosis, recommendation, confidence, smallSample };
}

/** Brief sections 18, 85: SLA compliance bottleneck, same FACT/DIAGNOSIS/RECOMMENDATION shape. */
export function analyzeSlaBottleneck(input: { currentBreachRate: number | null; previousBreachRate: number | null; currentCaseCount: number; previousCaseCount: number }): BottleneckInsight | null {
  if (input.currentBreachRate === null || input.previousBreachRate === null) return null;
  const change = comparePeriods(input.currentBreachRate, input.previousBreachRate);
  if (change.percentChange === null || Math.abs(change.percentChange) < 5) return null;

  const direction = change.percentChange > 0 ? 'worsened' : 'improved';
  const fact = `SLA breach rate ${direction} from ${(input.previousBreachRate * 100).toFixed(0)}% to ${(input.currentBreachRate * 100).toFixed(0)}%.`;
  const diagnosis = direction === 'worsened'
    ? 'More cases are exceeding the configured resolution SLA than in the prior period.'
    : 'Fewer cases are exceeding the configured resolution SLA than in the prior period.';
  const recommendation = direction === 'worsened'
    ? 'Check whether backlog or unassigned cases have grown, and whether current staffing/assignment covers the volume.'
    : 'No action needed — monitor to confirm the improvement holds.';

  const smallSample = input.currentCaseCount < 10 || input.previousCaseCount < 10;
  return { fact, diagnosis, recommendation, confidence: smallSample ? 'LOW' : 'HIGH', smallSample };
}
