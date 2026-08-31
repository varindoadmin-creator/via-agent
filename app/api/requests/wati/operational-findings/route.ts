import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth';
import { listFindings, type ListFindingsFilters } from '@/lib/operationalIntelligence/findingStore';
import { rankOpenFindings } from '@/lib/operationalIntelligence/priorityService';
import type { FindingStatus, FindingCategory } from '@/lib/operationalIntelligence/types';

export const dynamic = 'force-dynamic';

const ALL_STATUSES: FindingStatus[] = ['OPEN', 'ACKNOWLEDGED', 'ACTION_PLANNED', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED', 'EXPIRED'];

// GET /api/requests/wati/operational-findings — the queue behind
// /requests/wati/operational-intelligence. `ranked=true` returns findings in
// transparent priority order (lib/operationalIntelligence/priorityService.ts)
// instead of raw detected_at order.
export async function GET(req: NextRequest) {
  const role = await verifySessionToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!role) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const statusParam = searchParams.get('status');
  const categoryParam = searchParams.get('category');
  const ranked = searchParams.get('ranked') === 'true';

  const filters: ListFindingsFilters = {
    status: statusParam ? (statusParam.split(',').filter(s => (ALL_STATUSES as string[]).includes(s)) as FindingStatus[]) : undefined,
    category: categoryParam ? (categoryParam as FindingCategory) : undefined,
    limit: 200,
  };

  try {
    if (ranked) {
      const rankedFindings = await rankOpenFindings(filters);
      return NextResponse.json({ success: true, findings: rankedFindings.map(r => ({ ...r.finding, priorityScore: r.score })) });
    }
    const findings = await listFindings(filters);
    return NextResponse.json({ success: true, findings });
  } catch (error) {
    console.error('[OperationalFindings]', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ success: false, error: 'Unable to load operational findings.' }, { status: 500 });
  }
}
