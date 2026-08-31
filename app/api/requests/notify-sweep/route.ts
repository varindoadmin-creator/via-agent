import { NextResponse } from 'next/server';
import { recordCronRun } from '@/lib/cron/runLog';
import { sendMail } from '@/lib/email/sendMail';
import { supabaseSelect, supabasePatch } from '@/lib/supabase/rest';

export const maxDuration = 60;

const JOB_NAME = 'requests-notify-sweep';
const ALERT_TO = process.env.VIA_ALERT_EMAIL || 'varindo.admin@gmail.com';

interface RequestRow {
  id: string; request_type: 'sample' | 'catalogue' | 'quote'; customer_name: string | null;
  phone: string | null; item_code: string | null; created_at: string;
}

const TYPE_LABEL: Record<RequestRow['request_type'], string> = { sample: 'Sample', catalogue: 'Catalogue', quote: 'Quote' };

/**
 * Triggered periodically by an external cron-job.org scheduled job (see
 * middleware.ts CRON_PATHS), same pattern as the existing wati/*.sweep jobs.
 * The website form that creates `requests` rows lives outside this repo and
 * inserts directly into Supabase — there is no synchronous creation endpoint
 * here to hook an email send into (brief section 49-51). Polling for
 * `notified_at IS NULL` decouples notification from that external form
 * entirely, and an email failure just leaves the row unnotified for the next
 * run — the Supabase record itself is never at risk (brief section 92).
 */
export async function POST() {
  const startedAt = new Date().toISOString();
  try {
    const rows = await supabaseSelect<RequestRow>(
      'requests',
      'notified_at=is.null&select=id,request_type,customer_name,phone,item_code,created_at&order=created_at.asc&limit=100',
    );

    if (rows.length === 0) {
      await recordCronRun(JOB_NAME, 'success', startedAt, { notified: 0 });
      return NextResponse.json({ success: true, notified: 0 });
    }

    for (const row of rows) {
      console.info('[requests.notifySweep]', JSON.stringify({ event: 'sample_request.received', id: row.id, type: row.request_type }));
    }

    const tableRows = rows.map(r => `
      <tr>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e5e5">${TYPE_LABEL[r.request_type]}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e5e5">${r.customer_name || '—'}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e5e5">${r.phone || '—'}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e5e5">${r.item_code || '—'}</td>
      </tr>`).join('');
    const html = `<p>${rows.length} new sample/catalogue/quote request${rows.length === 1 ? '' : 's'}:</p>
      <table style="border-collapse:collapse;width:100%;max-width:640px">
        <thead><tr style="background:#f5f5f5;text-align:left;font-size:12px;text-transform:uppercase;color:#666">
          <th style="padding:6px 10px">Type</th><th style="padding:6px 10px">Customer</th><th style="padding:6px 10px">Phone</th><th style="padding:6px 10px">Item</th>
        </tr></thead><tbody>${tableRows}</tbody></table>
      <p style="margin-top:16px"><a href="https://via-601025884976.asia-southeast2.run.app/requests/samples">Open Requests in VIA →</a></p>`;

    await sendMail({ to: ALERT_TO, subject: `VIA: ${rows.length} new sample/catalogue/quote request${rows.length === 1 ? '' : 's'}`, html });

    // Only marked notified after the send succeeds — a failure leaves every row unnotified for retry.
    const now = new Date().toISOString();
    for (const row of rows) {
      await supabasePatch('requests', `id=eq.${encodeURIComponent(row.id)}`, { notified_at: now });
      console.info('[requests.notifySweep]', JSON.stringify({ event: 'sample_request.synced_to_via', id: row.id, type: row.request_type }));
    }

    await recordCronRun(JOB_NAME, 'success', startedAt, { notified: rows.length });
    return NextResponse.json({ success: true, notified: rows.length });
  } catch (err) {
    await recordCronRun(JOB_NAME, 'failed', startedAt, {}, err instanceof Error ? err.message : String(err));
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
