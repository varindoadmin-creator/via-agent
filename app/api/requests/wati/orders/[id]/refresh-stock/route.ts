import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth';
import { getDraftLines, updateDraftLineStockStatus } from '@/lib/integrations/wati/commercial/draft';
import { refreshLineStockStatus } from '@/lib/integrations/wati/commercial/workflow';

export const dynamic = 'force-dynamic';

// POST /api/requests/wati/orders/[id]/refresh-stock — pulls each line's
// current status from its linked Phase 3 stock inquiry (which resolves
// asynchronously via the existing vendor-check workflow) without duplicating
// that state machine here.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const role = await verifySessionToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!role) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  try {
    const lines = await getDraftLines(id);
    const updated = [];
    for (const line of lines) {
      if (!line.stock_inquiry_id) continue;
      const status = await refreshLineStockStatus(line.stock_inquiry_id);
      if (status !== line.stock_status) await updateDraftLineStockStatus(line.id, status);
      updated.push({ lineId: line.id, status });
    }
    return NextResponse.json({ success: true, updated });
  } catch (error) {
    console.error('[WatiOrderRefreshStock]', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Refresh failed.' }, { status: 500 });
  }
}
