import { NextRequest, NextResponse } from 'next/server';
import { getZohoAccessToken, getZohoApiBaseUrl, getZohoOrgId } from '@/lib/zoho/auth';

// Extract invoice number from PDF buffer using pdfjs-dist
async function extractInvoiceNumber(buffer: Buffer): Promise<string | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
    pdfjsLib.GlobalWorkerOptions.workerSrc = '';

    const doc = await pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
    }).promise;

    let text = '';
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      text += (content.items as Array<{ str: string }>).map(item => item.str).join(' ');
    }

    const match = text.match(/Referensi[:\s]+(VFH\/INV-\d+)/);
    return match ? match[1] : null;
  } catch (e) {
    console.error('[PDF Extract]', e);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    if (!files.length) {
      return NextResponse.json({ error: 'No files uploaded' }, { status: 400 });
    }

    const token = await getZohoAccessToken();
    const base = getZohoApiBaseUrl();
    const orgId = getZohoOrgId();

    const results: Array<{
      filename: string;
      invoice_number: string | null;
      invoice_id: string | null;
      customer_name: string | null;
      success: boolean;
      error?: string;
    }> = [];

    for (const file of files) {
      const filename = file.name;
      try {
        const buffer = Buffer.from(await file.arrayBuffer());

        // Step 1: Extract invoice number from PDF
        const invoiceNumber = await extractInvoiceNumber(buffer);
        if (!invoiceNumber) {
          results.push({ filename, invoice_number: null, invoice_id: null, customer_name: null,
            success: false, error: 'Could not extract invoice number from PDF' });
          continue;
        }

        // Step 2: Find invoice in Zoho
        const searchRes = await fetch(
          `${base}/invoices?invoice_number=${encodeURIComponent(invoiceNumber)}&organization_id=${orgId}`,
          { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
        );
        const searchData = await searchRes.json();
        const invoice = searchData.invoices?.[0];

        if (!invoice) {
          results.push({ filename, invoice_number: invoiceNumber, invoice_id: null, customer_name: null,
            success: false, error: `Invoice ${invoiceNumber} not found in Zoho` });
          continue;
        }

        // Step 3: Attach PDF to invoice
        const attachForm = new FormData();
        attachForm.append('attachment', new Blob([buffer], { type: 'application/pdf' }), filename);

        const attachRes = await fetch(
          `${base}/invoices/${invoice.invoice_id}/attachment?organization_id=${orgId}`,
          {
            method: 'POST',
            headers: { Authorization: `Zoho-oauthtoken ${token}` },
            body: attachForm,
          }
        );
        const attachData = await attachRes.json();

        if (!attachRes.ok && attachData.code !== 0) {
          throw new Error(attachData.message || 'Attachment failed');
        }

        results.push({
          filename,
          invoice_number: invoiceNumber,
          invoice_id: invoice.invoice_id,
          customer_name: invoice.customer_name,
          success: true,
        });

      } catch (e) {
        results.push({ filename, invoice_number: null, invoice_id: null, customer_name: null,
          success: false, error: String(e) });
      }
    }

    const succeeded = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    return NextResponse.json({ success: true, succeeded, failed, results });

  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
