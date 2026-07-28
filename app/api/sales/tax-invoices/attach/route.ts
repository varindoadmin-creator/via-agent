import { NextRequest, NextResponse } from 'next/server';
import { getZohoAccessToken, getZohoApiBaseUrl, getZohoOrgId } from '@/lib/zoho/auth';
import { fetchWithRetry } from '@/lib/zoho/retry';

// Extract invoice number from PDF buffer using pdfjs-dist
async function extractInvoiceNumber(buffer: Buffer): Promise<string | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
    // pdfjs resolves its worker via an eval'd require(workerSrc), which breaks
    // once webpack processes the require() path string. Pre-registering the
    // worker module on globalThis lets pdfjs pick it up directly and skip
    // path resolution (and workerSrc) entirely — see PDFWorker._mainThreadWorkerMessageHandler.
    if (!(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = require('pdfjs-dist/legacy/build/pdf.worker.js');
    }

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
      skipped?: boolean;
      error?: string;
    }> = [];
    const attachedInvoiceIds = new Set<string>();

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
        const searchRes = await fetchWithRetry(
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

        const invoiceId = String(invoice.invoice_id);
        if (invoice.has_attachment || attachedInvoiceIds.has(invoiceId)) {
          results.push({
            filename,
            invoice_number: invoiceNumber,
            invoice_id: invoiceId,
            customer_name: invoice.customer_name,
            success: false,
            skipped: true,
            error: 'An attachment already exists in Zoho',
          });
          continue;
        }

        // Step 3: Attach PDF only when the invoice has no existing attachment
        const attachForm = new FormData();
        attachForm.append('attachment', new Blob([buffer], { type: 'application/pdf' }), filename);

        const attachRes = await fetchWithRetry(
          `${base}/invoices/${invoiceId}/attachment?organization_id=${orgId}`,
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

        attachedInvoiceIds.add(invoiceId);
        results.push({
          filename,
          invoice_number: invoiceNumber,
          invoice_id: invoiceId,
          customer_name: invoice.customer_name,
          success: true,
        });

      } catch (e) {
        results.push({ filename, invoice_number: null, invoice_id: null, customer_name: null,
          success: false, error: String(e) });
      }
    }

    const succeeded = results.filter(r => r.success).length;
    const skipped = results.filter(r => r.skipped).length;
    const failed = results.filter(r => !r.success && !r.skipped).length;

    return NextResponse.json({ success: true, succeeded, skipped, failed, results });

  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
