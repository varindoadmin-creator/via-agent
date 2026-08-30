import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth';
import { getCommercialDraft, updateCommercialDraft } from '@/lib/integrations/wati/commercial/draft';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const role = await verifySessionToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!role) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  try {
    const draft = await getCommercialDraft(id);
    if (!draft) return NextResponse.json({ success: false, error: 'Commercial draft not found.' }, { status: 404 });
    if (draft.status === 'COMPLETED') {
      return NextResponse.json({ success: false, error: 'This draft has already been executed and cannot be rejected.' }, { status: 409 });
    }
    await updateCommercialDraft(draft.id, draft.version, { status: 'CANCELLED' });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[WatiOrderReject]', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Reject failed.' }, { status: 500 });
  }
}
