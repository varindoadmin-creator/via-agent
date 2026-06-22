import { NextRequest, NextResponse } from 'next/server';
import { getZohoAccessToken, getZohoApiBaseUrl, getZohoOrgId } from '@/lib/zoho/auth';

export async function POST(request: NextRequest) {
  try {
    const { contact_ids } = await request.json() as { contact_ids: string[] };
    if (!contact_ids?.length) return NextResponse.json({ error: 'contact_ids required' }, { status: 400 });

    const token = await getZohoAccessToken();
    const base = getZohoApiBaseUrl();
    const orgId = getZohoOrgId();

    const results = await Promise.all(
      contact_ids.map(async (id) => {
        try {
          const res = await fetch(`${base}/contacts/${id}?organization_id=${orgId}`, {
            headers: { Authorization: `Zoho-oauthtoken ${token}` },
          });
          const data = await res.json();
          const c = data.contact;
          return {
            contact_id: id,
            company_name: String(c?.company_name || c?.contact_name || ''),
            contact_name: String(c?.contact_name || ''),
            phone: String(c?.phone || c?.mobile || ''),
            mobile: String(c?.mobile || ''),
            billing_address: c?.billing_address || null,
          };
        } catch {
          return { contact_id: id, company_name: '', contact_name: '', phone: '', mobile: '', billing_address: null };
        }
      })
    );

    return NextResponse.json({ success: true, contacts: results });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
