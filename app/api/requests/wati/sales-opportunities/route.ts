import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth';
import { listActions, type ListActionsFilters } from '@/lib/proactiveActions/store';
import type { ProactiveActionStatus, ProactiveActionType } from '@/lib/proactiveActions/types';

export const dynamic = 'force-dynamic';

const ALL_STATUSES: ProactiveActionStatus[] = [
  'DETECTED', 'REVIEW_REQUIRED', 'APPROVED', 'SCHEDULED', 'SENT', 'CUSTOMER_RESPONDED',
  'CONVERTED', 'DISMISSED', 'EXPIRED', 'FAILED', 'CANCELLED',
];

// GET /api/requests/wati/sales-opportunities — the queue behind
// /requests/wati/sales-opportunities.
export async function GET(req: NextRequest) {
  const role = await verifySessionToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!role) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const statusParam = searchParams.get('status');
  const typeParam = searchParams.get('type');

  const filters: ListActionsFilters = {
    status: statusParam ? (statusParam.split(',').filter(s => (ALL_STATUSES as string[]).includes(s)) as ProactiveActionStatus[]) : ALL_STATUSES,
    type: typeParam ? (typeParam as ProactiveActionType) : undefined,
    limit: 300,
  };

  try {
    const actions = await listActions(filters);
    return NextResponse.json({ success: true, actions });
  } catch (error) {
    console.error('[SalesOpportunities]', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ success: false, error: 'Unable to load sales opportunities.' }, { status: 500 });
  }
}
