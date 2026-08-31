import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth';
import { updateActionStatus } from '@/lib/operationalIntelligence/findingStore';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; actionId: string }> }) {
  const role = await verifySessionToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!role) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const { actionId } = await params;
  const body = await req.json().catch(() => ({}));
  if (!body.status) return NextResponse.json({ success: false, error: 'A status is required.' }, { status: 400 });

  try {
    const action = await updateActionStatus(actionId, body.status, role);
    return NextResponse.json({ success: true, action });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Action update failed.' }, { status: 409 });
  }
}
