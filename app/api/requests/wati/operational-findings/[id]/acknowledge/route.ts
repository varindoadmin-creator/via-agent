import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth';
import { acknowledgeFinding } from '@/lib/operationalIntelligence/findingStore';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const role = await verifySessionToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!role) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  try {
    const finding = await acknowledgeFinding(id, role, body.expectedVersion);
    return NextResponse.json({ success: true, finding });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Acknowledge failed.' }, { status: 409 });
  }
}
