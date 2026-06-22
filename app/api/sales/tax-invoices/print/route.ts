import { NextRequest, NextResponse } from 'next/server';
import { getZohoAccessToken, getZohoApiBaseUrl, getZohoOrgId } from '@/lib/zoho/auth';
import { PDFDocument } from 'pdf-lib';

export async function POST(request: NextRequest) {
  try {
    const { invoice_ids } = await request.json() as { invoice_ids: string[] };
    if (!invoice_ids?.length) {
      return NextResponse.json({ error: 'No invoice IDs provided' }, { status: 400 });
    }

    const token = await getZohoAccessToken();
    const base = getZohoApiBaseUrl();
    const orgId = getZohoOrgId();
    const headers = { Authorization: `Zoho-oauthtoken ${token}` };

    const merged = await PDFDocument.create();

    for (const invId of invoice_ids) {
      // 1. Fetch invoice PDF
      const invRes = await fetch(
        `${base}/invoices/${invId}?accept=pdf&organization_id=${orgId}`,
        { headers }
      );
      if (invRes.ok) {
        try {
          const invBytes = await invRes.arrayBuffer();
          const invDoc = await PDFDocument.load(invBytes);
          const pages = await merged.copyPages(invDoc, invDoc.getPageIndices());
          pages.forEach(p => merged.addPage(p));
        } catch (e) {
          console.error(`[Print] Failed to load invoice PDF for ${invId}:`, e);
        }
      }

      // 2. Fetch attachment (FP) if exists
      const attRes = await fetch(
        `${base}/invoices/${invId}/attachment?organization_id=${orgId}`,
        { headers }
      );
      if (attRes.ok && attRes.headers.get('content-type')?.includes('pdf')) {
        try {
          const attBytes = await attRes.arrayBuffer();
          const attDoc = await PDFDocument.load(attBytes);
          const pages = await merged.copyPages(attDoc, attDoc.getPageIndices());
          pages.forEach(p => merged.addPage(p));
        } catch (e) {
          console.error(`[Print] Failed to load attachment PDF for ${invId}:`, e);
        }
      }
    }

    if (merged.getPageCount() === 0) {
      return NextResponse.json({ error: 'No PDF pages could be generated' }, { status: 500 });
    }

    const pdfBytes = await merged.save();
    const buffer = Buffer.from(pdfBytes);

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="invoices-${new Date().toISOString().slice(0,10)}.pdf"`,
      },
    });

  } catch (err) {
    console.error('[Print]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
