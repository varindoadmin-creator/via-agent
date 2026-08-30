import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth';
import { getCustomerDraft } from '@/lib/customerIdentity/customerDraft';
import { supabaseSelect } from '@/lib/supabase/rest';
import { syncCustomerToWati } from '@/lib/customerIdentity/watiContactSync';
import { getCustomerById } from '@/lib/zoho/customers';
import type { CustomerChannelIdentity } from '@/lib/customerIdentity/channelIdentity';

export const dynamic = 'force-dynamic';

// POST /api/requests/wati/customers/[id]/retry-sync — brief section 67:
// "Retry WATI Sync" never re-creates or re-links the Zoho customer, it only
// re-attempts the one-directional contact-attribute push (section 61).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const role = await verifySessionToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!role) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  try {
    const draft = await getCustomerDraft(id);
    if (!draft || !draft.created_customer_id) {
      return NextResponse.json({ success: false, error: 'This draft has no created Zoho customer to sync.' }, { status: 409 });
    }
    const mappings = await supabaseSelect<CustomerChannelIdentity>(
      'customer_channel_identities',
      `normalized_phone=eq.${encodeURIComponent(draft.normalized_phone)}&customer_id=eq.${encodeURIComponent(draft.created_customer_id)}&select=*&limit=1`,
    );
    const mapping = mappings[0];
    if (!mapping) return NextResponse.json({ success: false, error: 'No mapping found for this customer/phone.' }, { status: 404 });

    const customer = await getCustomerById(draft.created_customer_id);
    if (!customer) return NextResponse.json({ success: false, error: 'Zoho customer not found.' }, { status: 404 });

    const result = await syncCustomerToWati({ channelIdentityId: mapping.id, normalizedPhone: draft.normalized_phone, customer });
    return NextResponse.json({ success: result.status === 'SYNCED', result });
  } catch (error) {
    console.error('[WatiCustomerRetrySync]', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Retry failed.' }, { status: 500 });
  }
}
