// ─── Customer segmentation ─────────────────────────────────────────────────────
// VIA Phase 12, brief section 12: deterministic ANALYTICAL segments only —
// never the commercial pricing Tier (`ZohoContact.cf_tier`). This module
// never reads or writes `cf_tier`, never assigns a pricing Tier, and its
// output is never fed back into Zoho. A customer can carry multiple segment
// tags at once (e.g. REPEAT_CUSTOMER + RECENT_ACTIVE) — this is a set of
// analytical labels, not a single mutually-exclusive bucket like Tier is.

export type CustomerSegment =
  | 'RECENT_ACTIVE' | 'REPEAT_CUSTOMER' | 'HIGH_ORDER_FREQUENCY' | 'HIGH_VALUE'
  | 'LAPSED' | 'NEW' | 'QUOTE_ONLY' | 'SAMPLE_ONLY';

export interface CustomerActivityFacts {
  customerId: string;
  firstOrderDate: string | null;
  lastOrderDate: string | null;
  orderCount: number;
  totalOrderValue: number;
  quotationCount: number;
  sampleRequestCount: number;
}

export interface SegmentationThresholds {
  recentActiveDays: number;
  lapsedDays: number;
  newCustomerDays: number;
  highOrderFrequencyCount: number;
  highValueIdr: number;
}

function envNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function defaultSegmentationThresholds(): SegmentationThresholds {
  return {
    recentActiveDays: envNumber('BI_SEGMENT_RECENT_ACTIVE_DAYS', 30),
    lapsedDays: envNumber('BI_SEGMENT_LAPSED_DAYS', 180),
    newCustomerDays: envNumber('BI_SEGMENT_NEW_CUSTOMER_DAYS', 30),
    highOrderFrequencyCount: envNumber('BI_SEGMENT_HIGH_FREQUENCY_ORDER_COUNT', 6),
    highValueIdr: envNumber('BI_SEGMENT_HIGH_VALUE_IDR', 50_000_000),
  };
}

export interface CustomerSegmentResult { customerId: string; segments: CustomerSegment[] }

/** Pure classification over already-aggregated facts — no I/O, no Zoho, no Tier. */
export function classifyCustomerSegments(facts: CustomerActivityFacts, now: Date = new Date(), thresholds: SegmentationThresholds = defaultSegmentationThresholds()): CustomerSegmentResult {
  const segments = new Set<CustomerSegment>();
  const daysSince = (iso: string | null): number | null => iso ? (now.getTime() - new Date(iso).getTime()) / 86_400_000 : null;

  const daysSinceFirst = daysSince(facts.firstOrderDate);
  const daysSinceLast = daysSince(facts.lastOrderDate);

  if (facts.orderCount === 0) {
    if (facts.quotationCount > 0) segments.add('QUOTE_ONLY');
    if (facts.sampleRequestCount > 0 && facts.quotationCount === 0) segments.add('SAMPLE_ONLY');
  } else {
    if (daysSinceFirst !== null && daysSinceFirst <= thresholds.newCustomerDays && facts.orderCount === 1) segments.add('NEW');
    if (facts.orderCount >= 2) segments.add('REPEAT_CUSTOMER');
    if (facts.orderCount >= thresholds.highOrderFrequencyCount) segments.add('HIGH_ORDER_FREQUENCY');
    if (facts.totalOrderValue >= thresholds.highValueIdr) segments.add('HIGH_VALUE');
    if (daysSinceLast !== null) {
      if (daysSinceLast <= thresholds.recentActiveDays) segments.add('RECENT_ACTIVE');
      else if (daysSinceLast > thresholds.lapsedDays) segments.add('LAPSED');
    }
  }

  return { customerId: facts.customerId, segments: [...segments] };
}

export function classifyCustomerSegmentsBatch(rows: CustomerActivityFacts[], now: Date = new Date(), thresholds: SegmentationThresholds = defaultSegmentationThresholds()): CustomerSegmentResult[] {
  return rows.map(row => classifyCustomerSegments(row, now, thresholds));
}

export function segmentCounts(results: CustomerSegmentResult[]): Record<CustomerSegment, number> {
  const counts: Record<CustomerSegment, number> = {
    RECENT_ACTIVE: 0, REPEAT_CUSTOMER: 0, HIGH_ORDER_FREQUENCY: 0, HIGH_VALUE: 0,
    LAPSED: 0, NEW: 0, QUOTE_ONLY: 0, SAMPLE_ONLY: 0,
  };
  for (const result of results) for (const segment of result.segments) counts[segment]++;
  return counts;
}
