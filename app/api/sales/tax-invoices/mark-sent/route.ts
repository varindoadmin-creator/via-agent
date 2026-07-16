import { NextRequest, NextResponse } from 'next/server';

const TABLE = 'tax_invoice_sent_log';

function supabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
  return { url: url.replace(/\/$/, ''), key };
}

interface SentInvoice {
  invoice_id: string;
  invoice_number: string;
  customer_name: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { invoices } = body as { invoices?: SentInvoice[] };
    if (!invoices?.length) {
      return NextResponse.json({ success: false, error: 'invoices required' }, { status: 400 });
    }

    const { url, key } = supabaseConfig();
    if (!url || !key) {
      return NextResponse.json({ success: false, error: 'Supabase is not configured.' }, { status: 500 });
    }

    const sentAt = new Date().toISOString();
    const rows = invoices.map(inv => ({
      invoice_id: inv.invoice_id,
      invoice_number: inv.invoice_number,
      customer_name: inv.customer_name,
      sent_at: sentAt,
    }));

    const res = await fetch(`${url}/rest/v1/${TABLE}?on_conflict=invoice_id`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal,resolution=merge-duplicates',
      },
      body: JSON.stringify(rows),
    });
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);

    return NextResponse.json({ success: true, sent_at: sentAt, count: rows.length });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
