// ─── Analytics metric service ─────────────────────────────────────────────────
// VIA Customer Operations Phase 9, brief section 40: the ONE service both the
// admin dashboard and internal Jarvis tools call — neither ever queries raw
// tables or computes a KPI independently, so their numbers can never drift
// apart (brief section 38).

import { resolveTimeGrain, previousPeriod, comparePeriods, type DateRange, type TimeGrain, type PeriodComparison } from './periods.ts';
import { getCustomerServiceFunnel, getHandoffReasonBreakdown, type CustomerServiceFunnelResult, type HandoffReasonBreakdown } from './customerServiceAnalytics.ts';
import { getStockAnalytics, getVendorPerformance, type StockAnalyticsResult, type VendorPerformanceRow } from './stockAnalytics.ts';
import { getCommercialFunnel, type CommercialFunnelResult } from './funnel.ts';
import { getOnboardingFunnel, getIdentityFriction, type OnboardingFunnelResult, type IdentityFrictionResult } from './onboardingAnalytics.ts';
import { getDataQualityCoverage, type DataQualityCoverage } from './dataQuality.ts';
import { splitKnownAndUnknownSources } from './sourceAttribution.ts';
import { supabaseSelect } from '../supabase/rest.ts';

export type { TimeGrain, DateRange };

function resolveRange(grain: TimeGrain, custom?: DateRange): DateRange {
  if (grain === 'CUSTOM') {
    if (!custom) throw new Error('CUSTOM time grain requires an explicit range.');
    return custom;
  }
  return resolveTimeGrain(grain);
}

export interface ExecutiveOverview {
  range: DateRange;
  customerService: CustomerServiceFunnelResult;
  commercialFunnel: CommercialFunnelResult;
  inboundConversationsComparison: PeriodComparison;
  slaComplianceComparison: PeriodComparison | null;
  orderCountComparison: PeriodComparison;
  soValueComparison: PeriodComparison;
  freshness: { computedAt: string; note: string };
}

/**
 * Brief section 43 — the top-level executive view. Every number here is the
 * exact same function call a dashboard or Jarvis tool would make
 * individually; this just bundles them for one page load.
 */
export async function getExecutiveOverview(grain: TimeGrain, custom?: DateRange): Promise<ExecutiveOverview> {
  const range = resolveRange(grain, custom);
  const prevRange = previousPeriod(range);

  const [customerService, prevCustomerService, commercialFunnel, prevCommercialFunnel] = await Promise.all([
    getCustomerServiceFunnel(range),
    getCustomerServiceFunnel(prevRange),
    getCommercialFunnel(range),
    getCommercialFunnel(prevRange),
  ]);

  return {
    range,
    customerService,
    commercialFunnel,
    inboundConversationsComparison: comparePeriods(customerService.inboundConversations, prevCustomerService.inboundConversations),
    slaComplianceComparison: customerService.slaCompliance !== null && prevCustomerService.slaCompliance !== null
      ? comparePeriods(customerService.slaCompliance, prevCustomerService.slaCompliance)
      : null,
    orderCountComparison: comparePeriods(commercialFunnel.ordersCreated, prevCommercialFunnel.ordersCreated),
    soValueComparison: comparePeriods(commercialFunnel.soValue, prevCommercialFunnel.soValue),
    // Brief section 58: revenue/order figures here are a live Zoho-linked
    // read of commercial_drafts at request time, not a cached snapshot — so
    // freshness is "live" as of this response, not a stale aggregate.
    freshness: { computedAt: new Date().toISOString(), note: 'Computed live from current operational data at request time.' },
  };
}

export interface CustomerServiceDashboard {
  range: DateRange;
  funnel: CustomerServiceFunnelResult;
  handoffReasons: HandoffReasonBreakdown[];
}

export async function getCustomerServiceDashboard(grain: TimeGrain, custom?: DateRange): Promise<CustomerServiceDashboard> {
  const range = resolveRange(grain, custom);
  const [funnel, handoffReasons] = await Promise.all([getCustomerServiceFunnel(range), getHandoffReasonBreakdown(range)]);
  return { range, funnel, handoffReasons };
}

export interface StockDashboard {
  range: DateRange;
  overall: StockAnalyticsResult;
  byVendor: VendorPerformanceRow[];
}

export async function getStockDashboard(grain: TimeGrain, custom?: DateRange): Promise<StockDashboard> {
  const range = resolveRange(grain, custom);
  const [overall, byVendor] = await Promise.all([getStockAnalytics(range), getVendorPerformance(range)]);
  return { range, overall, byVendor };
}

export interface CommercialDashboard {
  range: DateRange;
  funnel: CommercialFunnelResult;
}

export async function getCommercialDashboard(grain: TimeGrain, custom?: DateRange): Promise<CommercialDashboard> {
  const range = resolveRange(grain, custom);
  return { range, funnel: await getCommercialFunnel(range) };
}

export interface OnboardingDashboard {
  range: DateRange;
  funnel: OnboardingFunnelResult;
  identityFriction: IdentityFrictionResult;
}

export async function getOnboardingDashboard(grain: TimeGrain, custom?: DateRange): Promise<OnboardingDashboard> {
  const range = resolveRange(grain, custom);
  const [funnel, identityFriction] = await Promise.all([getOnboardingFunnel(range), getIdentityFriction(range)]);
  return { range, funnel, identityFriction };
}

interface WatiMessageSourceRow { source: string | null }

export interface SourceAttributionDashboard {
  range: DateRange;
  known: Array<{ source: string; count: number }>;
  unknownCount: number;
}

export async function getSourceAttributionDashboard(grain: TimeGrain, custom?: DateRange): Promise<SourceAttributionDashboard> {
  const range = resolveRange(grain, custom);
  const messages = await supabaseSelect<WatiMessageSourceRow>('wati_messages', `received_at=gte.${range.start.toISOString()}&received_at=lt.${range.end.toISOString()}&direction=eq.INBOUND&select=source`);
  const counts = new Map<string, number>();
  for (const m of messages) {
    const key = m.source || 'UNKNOWN';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const rows = Array.from(counts.entries()).map(([source, count]) => ({ source, leads: 0, inquiries: count, quotations: 0, orders: 0, soValue: 0 }));
  const { known, unknown } = splitKnownAndUnknownSources(rows);
  return { range, known: known.map(k => ({ source: k.source, count: k.inquiries })), unknownCount: unknown?.inquiries ?? 0 };
}

export async function getDataQualityDashboard(grain: TimeGrain, custom?: DateRange): Promise<{ range: DateRange; coverage: DataQualityCoverage }> {
  const range = resolveRange(grain, custom);
  return { range, coverage: await getDataQualityCoverage(range) };
}
