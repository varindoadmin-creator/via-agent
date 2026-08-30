import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth';
import { sendPreparedResponse } from '@/lib/integrations/wati/stock/service';

/** Admin-review-send action (brief section 28/43) — the default rollout mode while `AUTO_SEND_STOCK_RESPONSES` stays false. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const role = await verifySessionToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!role) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  try {
    const sent = await sendPreparedResponse(id, role);
    if (!sent) return NextResponse.json({ success: false, error: 'Nothing to send for this inquiry.' }, { status: 409 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[wati.stock.send]', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ success: false, error: 'Unable to send reply.' }, { status: 500 });
  }
}
