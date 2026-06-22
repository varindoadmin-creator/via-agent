import { NextRequest, NextResponse } from 'next/server';
import { getZohoAccessToken, getZohoApiBaseUrl } from '@/lib/zoho/auth';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);
const ORG_ID = () => process.env.ZOHO_ORGANIZATION_ID || '';

async function fetchInvoicePdf(invoiceId: string): Promise<Buffer> {
  const token = await getZohoAccessToken();
  const base = getZohoApiBaseUrl();
  const url = `${base}/invoices/${invoiceId}?accept=pdf&organization_id=${ORG_ID()}`;
  const res = await fetch(url, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  });
  if (!res.ok) throw new Error(`PDF fetch failed: ${res.status}`);
  const buf = await res.arrayBuffer();
  return Buffer.from(buf);
}

// GET /api/invoices/pdf?invoice_id=xxx  → stream PDF to browser
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const invoiceId = searchParams.get('invoice_id');
  if (!invoiceId) return NextResponse.json({ error: 'invoice_id required' }, { status: 400 });

  try {
    const pdfBuffer = await fetchInvoicePdf(invoiceId);
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="invoice-${invoiceId}.pdf"`,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// POST /api/invoices/pdf  → print batch to local printer
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { invoice_ids, printer } = body as { invoice_ids: string[]; printer?: string };

  if (!invoice_ids?.length) {
    return NextResponse.json({ error: 'invoice_ids required' }, { status: 400 });
  }

  const results: Array<{ invoice_id: string; success: boolean; error?: string }> = [];
  const tmpDir = path.join(os.tmpdir(), 'via-print');

  if (!existsSync(tmpDir)) await mkdir(tmpDir, { recursive: true });

  for (const invoiceId of invoice_ids) {
    const tmpFile = path.join(tmpDir, `invoice-${invoiceId}.pdf`);
    try {
      // 1. Fetch PDF from Zoho
      const pdfBuffer = await fetchInvoicePdf(invoiceId);
      await writeFile(tmpFile, pdfBuffer);

      // 2. Print using lpr (Mac/Linux built-in)
      const printerFlag = printer ? `-P "${printer}"` : '';
      const cmd = `lpr ${printerFlag} -o media=A4 "${tmpFile}"`;
      console.log(`[Print] ${cmd}`);
      await execAsync(cmd);

      results.push({ invoice_id: invoiceId, success: true });
    } catch (err) {
      console.error(`[Print] Error for ${invoiceId}:`, err);
      results.push({ invoice_id: invoiceId, success: false, error: String(err) });
    } finally {
      // Clean up temp file
      try { await unlink(tmpFile); } catch {}
    }
  }

  const successCount = results.filter(r => r.success).length;
  return NextResponse.json({
    success: true,
    printed: successCount,
    failed: results.length - successCount,
    results,
  });
}
