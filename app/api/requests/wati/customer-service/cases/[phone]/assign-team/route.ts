import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth';
import { assignToTeam } from '@/lib/customerService/assignment';
import type { ServiceTeam } from '@/lib/customerService/handoffReasons';

export const dynamic = 'force-dynamic';

const VALID_TEAMS: ServiceTeam[] = ['CUSTOMER_SERVICE', 'SALES', 'FINANCE', 'OPERATIONS', 'MANAGEMENT'];

export async function POST(req: NextRequest, { params }: { params: Promise<{ phone: string }> }) {
  const role = await verifySessionToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!role) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const { phone } = await params;
  try {
    const body = await req.json();
    const team = body.team as ServiceTeam;
    if (!VALID_TEAMS.includes(team)) return NextResponse.json({ success: false, error: 'Invalid team.' }, { status: 400 });
    const result = await assignToTeam(decodeURIComponent(phone), team, role);
    return NextResponse.json({ success: true, case: result });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Assign failed.' }, { status: 500 });
  }
}
