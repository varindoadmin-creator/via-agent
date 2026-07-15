import { NextRequest, NextResponse } from 'next/server';
import { sendMail } from '@/lib/email/sendMail';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { to, filename, csv } = body as { to?: string; filename?: string; csv?: string };

    if (!to || !EMAIL_RE.test(to)) {
      return NextResponse.json({ success: false, error: 'A valid recipient email is required.' }, { status: 400 });
    }
    if (!filename || !csv) {
      return NextResponse.json({ success: false, error: 'filename and csv are required.' }, { status: 400 });
    }

    const label = filename.replace(/\.csv$/i, '').replace(/_/g, ' ');
    await sendMail({
      to,
      subject: `VIA — ${label} Inventory Export`,
      text: `Attached: ${label} inventory export from VIA.`,
      attachments: [{ filename, content: csv, contentType: 'text/csv' }],
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
