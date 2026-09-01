import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth';
import { dismissAction } from '@/lib/proactiveActions/store';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const role = await verifySessionToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!role) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  try {
    const action = await dismissAction(id, role, body.expectedVersion, body.reason ?? 'OTHER');
    return NextResponse.json({ success: true, action });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Dismiss failed.' }, { status: 409 });
  }
}
