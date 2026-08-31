import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth';
import { getOperationalBrief } from '@/lib/operationalIntelligence/brief';
import { isOperationalFindingsUiEnabled } from '@/lib/customerIdentity/featureFlags';

export const dynamic = 'force-dynamic';

// GET /api/requests/wati/operational-findings/brief — backs both the
// dashboard's "Jarvis — Needs Your Attention" widget (brief section 142) and
// the get_operational_brief Jarvis tool, so the two can never disagree.
export async function GET(req: NextRequest) {
  const role = await verifySessionToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!role) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  if (!isOperationalFindingsUiEnabled()) return NextResponse.json({ success: true, enabled: false });

  try {
    const brief = await getOperationalBrief();
    return NextResponse.json({ success: true, enabled: true, ...brief });
  } catch (error) {
    console.error('[OperationalBrief]', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ success: false, error: 'Unable to load the operational brief.' }, { status: 500 });
  }
}
