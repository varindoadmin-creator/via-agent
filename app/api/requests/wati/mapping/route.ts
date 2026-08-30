import { NextResponse } from 'next/server';
import { listChannelIdentitiesForAdmin } from '@/lib/customerIdentity/channelIdentity';
import { getCustomerById } from '@/lib/zoho/customers';

export const dynamic = 'force-dynamic';

// GET /api/requests/wati/mapping — brief section 21: view every WhatsApp <->
// Zoho customer mapping, its verification/relationship status, and WATI sync
// status (the view/disable subset of the admin actions this phase ships).
export async function GET() {
  try {
    const mappings = await listChannelIdentitiesForAdmin();
    const customerIds = Array.from(new Set(mappings.map(m => m.customer_id)));
    const customers = await Promise.all(customerIds.map(id => getCustomerById(id)));
    const nameById = new Map(customers.filter((c): c is NonNullable<typeof c> => Boolean(c)).map(c => [c.contact_id, c.company_name || c.contact_name]));
    const items = mappings.map(m => ({ ...m, customer_name: nameById.get(m.customer_id) || m.customer_id }));
    return NextResponse.json({ success: true, mappings: items });
  } catch (error) {
    console.error('[WatiMappingDashboard]', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ success: false, error: 'Unable to load customer mappings.' }, { status: 500 });
  }
}
