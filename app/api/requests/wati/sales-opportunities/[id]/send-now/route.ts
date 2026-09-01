import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth';
import { sendProactiveOutreach } from '@/lib/proactiveActions/sendOutreach';

export const dynamic = 'force-dynamic';

// Manually trigger the send for one APPROVED (or already AUTO_ALLOWED) WHATSAPP
// action instead of waiting for the next sweep — eligibility, price/customer
// facts, and templates are all still re-validated exactly as the sweep does.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const role = await verifySessionToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!role) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  try {
    const outcome = await sendProactiveOutreach(id);
    return NextResponse.json({ success: true, outcome });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Send failed.' }, { status: 500 });
  }
}
