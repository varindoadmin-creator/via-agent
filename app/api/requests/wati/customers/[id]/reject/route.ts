import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth';
import { getCustomerDraft, updateCustomerDraft } from '@/lib/customerIdentity/customerDraft';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const role = await verifySessionToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!role) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  try {
    const draft = await getCustomerDraft(id);
    if (!draft) return NextResponse.json({ success: false, error: 'Customer draft not found.' }, { status: 404 });
    if (draft.status === 'CUSTOMER_CREATED') {
      return NextResponse.json({ success: false, error: 'This customer has already been created and cannot be rejected.' }, { status: 409 });
    }
    await updateCustomerDraft(draft.id, draft.version, { status: 'CANCELLED' });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[WatiCustomerReject]', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Reject failed.' }, { status: 500 });
  }
}
