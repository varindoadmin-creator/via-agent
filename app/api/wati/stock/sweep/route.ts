import { NextResponse } from 'next/server';
import { recordCronRun } from '@/lib/cron/runLog';
import { sendMail } from '@/lib/email/sendMail';
import { findVendorClosedInquiries, findOpenInquiriesForSla } from '@/lib/integrations/wati/stock/store';
import { reopenIfNowOpen } from '@/lib/integrations/wati/stock/service';
import { computeSlaStatus } from '@/lib/integrations/wati/stock/sla';

export const maxDuration = 300;
const ALERT_TO = process.env.VIA_ALERT_EMAIL || 'varindo.admin@gmail.com';

/**
 * Triggered periodically by an external cron-job.org scheduled job (see
 * middleware.ts CRON_PATHS) — deferred vendor checks and SLA breaches must
 * never depend on admin memory (brief section 22). Two responsibilities:
 * (1) reopen VENDOR_CLOSED checks whose vendor is now open, (2) send one
 * bounded summary email if any open inquiry has breached its SLA — not
 * per-inquiry spam.
 */
export async function POST() {
  const startedAt = new Date().toISOString();
  try {
    const closedInquiries = await findVendorClosedInquiries();
    const reopenedResults = await Promise.all(closedInquiries.map(inquiry => reopenIfNowOpen(inquiry).catch(() => false)));
    const reopenedCount = reopenedResults.filter(Boolean).length;

    const openInquiries = await findOpenInquiriesForSla();
    const breached = openInquiries.filter(inquiry => computeSlaStatus(new Date(inquiry.created_at)) === 'BREACHED');

    let emailed = false;
    if (breached.length > 0) {
      const rows = breached.map(i => `
        <tr>
          <td style="padding:6px 10px;border-bottom:1px solid #e5e5e5;font-family:monospace">${i.item_code || i.item_id || '—'}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #e5e5e5">${i.primary_source || '—'}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #e5e5e5">${i.status}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #e5e5e5">${i.conversation_id}</td>
        </tr>`).join('');
      const html = `<p>${breached.length} stock inquiry${breached.length === 1 ? '' : 'ies'} past SLA:</p>
        <table style="border-collapse:collapse;width:100%;max-width:640px">
          <thead><tr style="background:#f5f5f5;text-align:left;font-size:12px;text-transform:uppercase;color:#666">
            <th style="padding:6px 10px">Item</th><th style="padding:6px 10px">Source</th><th style="padding:6px 10px">Status</th><th style="padding:6px 10px">Conversation</th>
          </tr></thead><tbody>${rows}</tbody></table>
        <p style="margin-top:16px"><a href="https://via-601025884976.asia-southeast2.run.app/requests/wati/stock">Open Stock Inquiries in VIA →</a></p>`;
      await sendMail({ to: ALERT_TO, subject: `VIA Alert: ${breached.length} stock inquiry SLA breach${breached.length === 1 ? '' : 'es'}`, html });
      emailed = true;
    }

    await recordCronRun('wati-stock-sweep', 'success', startedAt, { reopened: reopenedCount, breached: breached.length, emailed });
    return NextResponse.json({ success: true, reopened: reopenedCount, breached: breached.length, emailed });
  } catch (err) {
    await recordCronRun('wati-stock-sweep', 'failed', startedAt, {}, err instanceof Error ? err.message : String(err));
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
