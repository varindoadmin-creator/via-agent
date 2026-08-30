import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth';
import { recordVendorResponse } from '@/lib/integrations/wati/stock/service';

/**
 * Human Bridge dashboard action (brief section 13). "Record Available" /
 * "Record Out of Stock" bypass the free-text parser entirely (zero ambiguity
 * by construction); "Enter Vendor Response" goes through the deterministic
 * parser in lib/integrations/wati/stock/vendorResponse.ts.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const role = await verifySessionToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!role) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const action = body?.action as string | undefined;

  try {
    if (action === 'available') {
      await recordVendorResponse({ checkRequestId: id, recordedBy: role, directAvailability: 'AVAILABLE' });
    } else if (action === 'out_of_stock') {
      await recordVendorResponse({ checkRequestId: id, recordedBy: role, directAvailability: 'OUT_OF_STOCK' });
    } else if (action === 'text') {
      const rawText = String(body?.rawText || '').trim();
      if (!rawText) return NextResponse.json({ success: false, error: 'rawText required' }, { status: 400 });
      await recordVendorResponse({ checkRequestId: id, recordedBy: role, rawText });
    } else {
      return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[wati.stock.respond]', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ success: false, error: 'Unable to record vendor response.' }, { status: 500 });
  }
}
