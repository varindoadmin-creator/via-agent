import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth';
import { disableChannelIdentity } from '@/lib/customerIdentity/channelIdentity';

export const dynamic = 'force-dynamic';

// POST /api/requests/wati/mapping/[id]/disable — brief section 21. Disabling
// never deletes the row (audit trail preserved); a corrected mapping is
// created fresh alongside it.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const role = await verifySessionToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!role) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  try {
    await disableChannelIdentity(id, role);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[WatiMappingDisable]', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Disable failed.' }, { status: 500 });
  }
}
