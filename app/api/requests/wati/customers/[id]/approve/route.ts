import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth';
import { getCustomerDraft } from '@/lib/customerIdentity/customerDraft';
import { computeDraftHash } from '@/lib/customerIdentity/approval';
import { requestApproval, approveRequest } from '@/lib/commercialApprovals/store';
import { approveAndCreateCustomer, customerDraftMaterialFields } from '@/lib/commercialApprovals/executeCustomerCreation';
import { isZohoCustomerCreationEnabled } from '@/lib/customerIdentity/featureFlags';

export const dynamic = 'force-dynamic';

// POST /api/requests/wati/customers/[id]/approve — brief sections 11-15: the
// ONLY route that can turn a CustomerDraft into a real Zoho Customer. External
// WATI customers have no path to this endpoint (it requires an authenticated
// admin/director session; middleware.ts already gates every /api/requests/* path).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const role = await verifySessionToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!role) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  if (!isZohoCustomerCreationEnabled()) {
    return NextResponse.json({ success: false, error: 'Zoho customer creation is disabled (ZOHO_CUSTOMER_CREATION_ENABLED is not set to true).' }, { status: 503 });
  }

  const { id } = await params;
  try {
    const draft = await getCustomerDraft(id);
    if (!draft) return NextResponse.json({ success: false, error: 'Customer draft not found.' }, { status: 404 });
    if (draft.status !== 'READY_FOR_REVIEW') {
      return NextResponse.json({ success: false, error: `Draft is in status ${draft.status}, not ready for approval.` }, { status: 409 });
    }

    const draftHash = computeDraftHash(customerDraftMaterialFields(draft));
    const approval = await requestApproval({ draftType: 'CUSTOMER', draftId: draft.id, draftVersion: draft.version, draftHash });
    const approved = await approveRequest(approval.id, role);
    if (!approved) throw new Error('Unable to approve the request.');

    const result = await approveAndCreateCustomer(approved.id);
    return NextResponse.json({ success: true, customer: result });
  } catch (error) {
    console.error('[WatiCustomerApprove]', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Approval failed.' }, { status: 500 });
  }
}
