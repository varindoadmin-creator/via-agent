import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth';
import { getCommercialDraft, getDraftLines } from '@/lib/integrations/wati/commercial/draft';
import { computeDraftHash } from '@/lib/customerIdentity/approval';
import { requestApproval, approveRequest } from '@/lib/commercialApprovals/store';
import { approveAndCreateCommercialDraft, commercialDraftMaterialFields } from '@/lib/commercialApprovals/executeCommercialDraft';
import { isSalesOrderExecutionEnabled } from '@/lib/customerIdentity/featureFlags';

export const dynamic = 'force-dynamic';

// POST /api/requests/wati/orders/[id]/approve — brief sections 43-48: the
// ONLY route that can turn a CommercialDraft into a real Zoho Quotation/Sales
// Order. A WhatsApp "Ya, pesan" never reaches this — it only ever produces a
// READY_FOR_REVIEW draft (brief section 42).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const role = await verifySessionToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!role) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  if (!isSalesOrderExecutionEnabled()) {
    return NextResponse.json({ success: false, error: 'Sales Order/Quotation execution is disabled (SALES_ORDER_EXECUTION_ENABLED is not set to true).' }, { status: 503 });
  }

  const { id } = await params;
  try {
    const draft = await getCommercialDraft(id);
    if (!draft) return NextResponse.json({ success: false, error: 'Commercial draft not found.' }, { status: 404 });
    if (draft.status !== 'READY_FOR_REVIEW') {
      return NextResponse.json({ success: false, error: `Draft is in status ${draft.status}, not ready for approval.` }, { status: 409 });
    }
    const lines = await getDraftLines(draft.id);

    const draftHash = computeDraftHash(commercialDraftMaterialFields(draft, lines));
    const approval = await requestApproval({ draftType: 'COMMERCIAL', draftId: draft.id, draftVersion: draft.version, draftHash });
    const approved = await approveRequest(approval.id, role);
    if (!approved) throw new Error('Unable to approve the request.');

    const result = await approveAndCreateCommercialDraft(approved.id);
    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error('[WatiOrderApprove]', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Approval failed.' }, { status: 500 });
  }
}
