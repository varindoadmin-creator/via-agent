import { NextResponse } from 'next/server';
import {
  getExecutiveOverview, getCustomerServiceDashboard, getStockDashboard,
  getCommercialDashboard, getOnboardingDashboard, getSourceAttributionDashboard, getDataQualityDashboard,
  type TimeGrain,
} from '@/lib/analytics/metricService';

export const dynamic = 'force-dynamic';

const VALID_GRAINS: TimeGrain[] = ['TODAY', 'YESTERDAY', 'LAST_7_DAYS', 'THIS_MONTH', 'LAST_MONTH'];

// GET /api/requests/wati/analytics?grain=THIS_MONTH — the single route the
// consolidated dashboard calls, backed by lib/analytics/metricService.ts:
// the exact same service the internal Jarvis analytics tools call, so the
// dashboard and Jarvis can never disagree (brief section 40).
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

    return NextResponse.json({ success: true, grain, executive, customerService, stock, commercial, onboarding, sourceAttribution, dataQuality });
  } catch (error) {
    console.error('[CustomerOperationsAnalytics]', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ success: false, error: 'Unable to load customer operations analytics.' }, { status: 500 });
  }
}
