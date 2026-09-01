import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth';
import { getModelCostSummary } from '@/lib/jarvis/models/costDashboard';
import { resolveTimeGrain, type TimeGrain } from '@/lib/analytics/periods';

export const dynamic = 'force-dynamic';

const VALID_GRAINS: TimeGrain[] = ['TODAY', 'YESTERDAY', 'LAST_7_DAYS', 'THIS_MONTH', 'LAST_MONTH'];

// GET /api/requests/wati/system-health/cost — brief section 48's cost
// dashboard, director-only (same posture as every other Jarvis analytics
// surface — cost visibility is a management concern, not a Sales/CS one).
export async function GET(req: NextRequest) {
  const role = await verifySessionToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (role !== 'director') return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: role ? 403 : 401 });

  const { searchParams } = new URL(req.url);
  const grainParam = searchParams.get('grain');
  const grain = (VALID_GRAINS as string[]).includes(grainParam || '') ? (grainParam as TimeGrain) : 'TODAY';

  try {
    const summary = await getModelCostSummary(resolveTimeGrain(grain as Exclude<TimeGrain, 'CUSTOM'>));
    return NextResponse.json({ success: true, grain, ...summary });
  } catch (error) {
    console.error('[SystemHealth.cost]', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ success: false, error: 'Unable to load cost summary.' }, { status: 500 });
  }
}
