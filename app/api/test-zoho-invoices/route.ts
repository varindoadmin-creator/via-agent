import { NextRequest, NextResponse } from 'next/server';
import { getZohoAccessToken, getZohoApiBaseUrl, getZohoOrgId } from '@/lib/zoho/auth';
import { fetchWithRetry } from '@/lib/zoho/retry';

export async function GET(request: NextRequest) {
  const token = await getZohoAccessToken();
  const base = getZohoApiBaseUrl();
  const orgId = getZohoOrgId();

  // VFH/INV-000456 has FP attached
  const searchRes = await fetchWithRetry(
    `${base}/invoices?invoice_number=VFH/INV-000456&organization_id=${orgId}`,
    { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
  );
  const searchData = await searchRes.json();
  const invId = searchData.invoices?.[0]?.invoice_id;

  if (!invId) return NextResponse.json({ error: 'Invoice not found' });

  const results: Record<string, unknown> = { invoice_id: invId };

  // 1. Try invoice PDF download
  const pdfRes = await fetchWithRetry(
    `${base}/invoices/${invId}?accept=pdf&organization_id=${orgId}`,
    { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
  );
  results.invoice_pdf = {
    status: pdfRes.status,
    content_type: pdfRes.headers.get('content-type'),
    content_length: pdfRes.headers.get('content-length'),
  };

  // 2. Try attachment download
  const attRes = await fetchWithRetry(
    `${base}/invoices/${invId}/attachment?organization_id=${orgId}`,
    { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
  );
  results.attachment = {
    status: attRes.status,
    content_type: attRes.headers.get('content-type'),
    content_length: attRes.headers.get('content-length'),
  };

  // 3. Try print endpoint
  const printRes = await fetchWithRetry(
    `${base}/invoices/${invId}/print?organization_id=${orgId}`,
    { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
  );
  results.print = {
    status: printRes.status,
    content_type: printRes.headers.get('content-type'),
  };

  return NextResponse.json(results);
}
