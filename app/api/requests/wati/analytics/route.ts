import { NextResponse } from 'next/server';
import {
  getExecutiveOverview, getCustomerServiceDashboard, getStockDashboard,
  getCommercialDashboard, getOnboardingDashboard, getSourceAttributionDashboard, getDataQualityDashboard,
  type TimeGrain,
} from '@/lib/analytics/metricService';
import { resolveTimeGrain } from '@/lib/analytics/periods';
import { supabaseSelect } from '@/lib/supabase/rest';
import { classifyCustomerSegmentsBatch, segmentCounts, type CustomerActivityFacts } from '@/lib/metrics/segmentation';
import { getExtendedDataQualityReport } from '@/lib/metrics/dataQuality';
import { isManagementDecisionEngineUiEnabled } from '@/lib/customerIdentity/featureFlags';

export const dynamic = 'force-dynamic';

const VALID_GRAINS: TimeGrain[] = ['TODAY', 'YESTERDAY', 'LAST_7_DAYS', 'THIS_MONTH', 'LAST_MONTH'];

interface DraftAggRow { customer_id: string | null; type: string; status: string; total: number | null; created_at: string }

// Phase 12: same VIA-tracked commercial_drafts aggregation the
// get_customer_segments Jarvis tool uses (lib/jarvis/tools/decisionEngineering.ts)
// — duplicated here rather than imported because that tool file also pulls in
// the OpenAI Agents SDK types, which this plain API route has no reason to load.
async function buildCustomerActivityFacts(): Promise<CustomerActivityFacts[]> {
  const rows = await supabaseSelect<DraftAggRow>('commercial_drafts', 'customer_id=not.is.null&select=customer_id,type,status,total,created_at&limit=5000');
  const byCustomer = new Map<string, CustomerActivityFacts>();
  for (const row of rows) {
    if (!row.customer_id) continue;
    const facts = byCustomer.get(row.customer_id) ?? {
      customerId: row.customer_id, firstOrderDate: null, lastOrderDate: null,
      orderCount: 0, totalOrderValue: 0, quotationCount: 0, sampleRequestCount: 0,
    };
    if (row.type === 'QUOTATION') facts.quotationCount++;
    if (row.type === 'SALES_ORDER' && row.status === 'COMPLETED') {
      facts.orderCount++;
      facts.totalOrderValue += row.total ?? 0;
      if (!facts.firstOrderDate || row.created_at < facts.firstOrderDate) facts.firstOrderDate = row.created_at;
      if (!facts.lastOrderDate || row.created_at > facts.lastOrderDate) facts.lastOrderDate = row.created_at;
    }
    byCustomer.set(row.customer_id, facts);
  }
  return [...byCustomer.values()];
}

// GET /api/requests/wati/analytics?grain=THIS_MONTH — the single route the
// consolidated dashboard calls, backed by lib/analytics/metricService.ts:
// the exact same service the internal Jarvis analytics tools call, so the
// dashboard and Jarvis can never disagree (brief section 40). Phase 12 adds
// customer segmentation and the extended data-quality report — both
// Supabase-only and cheap; the Zoho-live BI (forecast/scenario/concentration/
// cohort/decision-brief) is reachable through Jarvis, not this static route,
// since those need explicit date-range parameters a conversational interface
// handles more naturally than a fixed dashboard grain.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const grainParam = searchParams.get('grain') || 'THIS_MONTH';
    const grain = VALID_GRAINS.includes(grainParam as TimeGrain) ? (grainParam as TimeGrain) : 'THIS_MONTH';

    const [executive, customerService, stock, commercial, onboarding, sourceAttribution, dataQuality] = await Promise.all([
      getExecutiveOverview(grain),
      getCustomerServiceDashboard(grain),
      getStockDashboard(grain),
      getCommercialDashboard(grain),
      getOnboardingDashboard(grain),
      getSourceAttributionDashboard(grain),
      getDataQualityDashboard(grain),
    ]);

    let decisionEngineering: { customerSegments: Record<string, number>; extendedDataQuality: Awaited<ReturnType<typeof getExtendedDataQualityReport>> } | null = null;
    if (isManagementDecisionEngineUiEnabled()) {
      const [segments, extendedDataQuality] = await Promise.all([
        buildCustomerActivityFacts().then(facts => segmentCounts(classifyCustomerSegmentsBatch(facts))),
        getExtendedDataQualityReport(resolveTimeGrain(grain === 'CUSTOM' ? 'THIS_MONTH' : grain)),
      ]);
      decisionEngineering = { customerSegments: segments, extendedDataQuality };
    }

    return NextResponse.json({ success: true, grain, executive, customerService, stock, commercial, onboarding, sourceAttribution, dataQuality, decisionEngineering });
  } catch (error) {
    console.error('[CustomerOperationsAnalytics]', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ success: false, error: 'Unable to load customer operations analytics.' }, { status: 500 });
  }
}
