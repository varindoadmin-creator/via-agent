import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth';
import { getFinding, listActions } from '@/lib/operationalIntelligence/findingStore';
import { getFindingOutcome } from '@/lib/operationalIntelligence/outcome';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const role = await verifySessionToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!role) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  try {
    const finding = await getFinding(id);
    if (!finding) return NextResponse.json({ success: false, error: 'Finding not found.' }, { status: 404 });
    const [actions, outcome] = await Promise.all([listActions(id), getFindingOutcome(id)]);
    return NextResponse.json({ success: true, finding, actions, outcome });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unable to load finding.' }, { status: 500 });
  }
}
