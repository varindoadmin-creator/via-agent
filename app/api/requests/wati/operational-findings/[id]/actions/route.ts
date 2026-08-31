import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth';
import { createActionPlan } from '@/lib/operationalIntelligence/findingStore';

export const dynamic = 'force-dynamic';

// POST /api/requests/wati/operational-findings/[id]/actions — brief section 56's
// lightweight action plan. Creating one also transitions the finding to
// ACTION_PLANNED (see findingStore.ts's createActionPlan).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const role = await verifySessionToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!role) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  if (!body.description) return NextResponse.json({ success: false, error: 'A description is required.' }, { status: 400 });

  try {
    const result = await createActionPlan(id, role, body.expectedVersion, {
      description: body.description, ownerRole: body.ownerRole ?? role, ownerTeam: body.ownerTeam, dueAt: body.dueAt,
    });
    return NextResponse.json({ success: true, action: result.action, finding: result.finding });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Action plan creation failed.' }, { status: 409 });
  }
}
