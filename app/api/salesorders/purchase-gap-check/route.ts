import { NextResponse } from 'next/server';
import { findSameDayPurchaseGaps } from '@/lib/purchaseGap/check';
import { getLoggedGapIds, logPurchaseGaps } from '@/lib/purchaseGap/log';
import { sendMail } from '@/lib/email/sendMail';

// Live check for the in-app alert on Home — always reflects current Zoho
// state (self-clears the moment a PO is placed), independent of whether/when
// the cron below last ran.
export async function GET() {
  try {
    const gaps = await findSameDayPurchaseGaps();
    return NextResponse.json({ success: true, gaps });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;
const ALERT_TO = process.env.VIA_ALERT_EMAIL || 'varindo.admin@gmail.com';

function jakartaDateStr(): string {
  return new Date(Date.now() + JAKARTA_OFFSET_MS).toISOString().split('T')[0];
}

function formatRp(n: number) {
  return 'Rp ' + Math.round(n).toLocaleString('id-ID');
}

// Triggered daily at 15:00 Asia/Jakarta by an external cron-job.org scheduled
// job (see middleware.ts for the x-cron-secret auth bypass — Hostinger's
// Node.js Web App hosting has no cron support of its own). Also callable
// manually while authenticated in the app, for testing.
//
// Flags Confirmed Sales Orders confirmed today that still haven't reached
// Zoho's "Ordered" sub-status (no Purchase Order placed for them yet) — this
// is how Admin forgetting to purchase items for a confirmed SO gets caught
// the same day, instead of days later.
export async function POST() {
  try {
    const gaps = await findSameDayPurchaseGaps();
    const today = jakartaDateStr();

    if (gaps.length === 0) {
      return NextResponse.json({ success: true, gap_count: 0, emailed: false });
    }

    const alreadyNotified = await getLoggedGapIds(today);
    const newGaps = gaps.filter(g => !alreadyNotified.has(g.salesorder_id));

    let emailed = false;
    if (newGaps.length > 0) {
      const rows = newGaps.map(g => `
        <tr>
          <td style="padding:6px 10px;border-bottom:1px solid #e5e5e5;font-family:monospace">${g.salesorder_number}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #e5e5e5">${g.customer_name || '(unnamed)'}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #e5e5e5;text-align:right">${formatRp(g.total)}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #e5e5e5">${g.sub_status_formatted}</td>
        </tr>`).join('');

      const html = `
        <p>${newGaps.length} Sales Order${newGaps.length === 1 ? ' was' : 's were'} confirmed today but ${newGaps.length === 1 ? "hasn't" : "haven't"} been Ordered (no Purchase Order placed) yet:</p>
        <table style="border-collapse:collapse;width:100%;max-width:640px">
          <thead>
            <tr style="background:#f5f5f5;text-align:left;font-size:12px;text-transform:uppercase;color:#666">
              <th style="padding:6px 10px">SO Number</th>
              <th style="padding:6px 10px">Customer</th>
              <th style="padding:6px 10px;text-align:right">Total</th>
              <th style="padding:6px 10px">Status</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <p style="margin-top:16px"><a href="https://varindoapp.com/purchases">Open Purchases in VIA →</a></p>
        <p style="color:#999;font-size:12px;margin-top:24px">Checked at 15:00 Asia/Jakarta. A Sales Order stops appearing here once a Purchase Order is placed for it.</p>
      `;
      const text = `${newGaps.length} Sales Order(s) confirmed today have not been Ordered yet:\n\n` +
        newGaps.map(g => `${g.salesorder_number} — ${g.customer_name || '(unnamed)'} — ${formatRp(g.total)} — ${g.sub_status_formatted}`).join('\n') +
        `\n\nOpen Purchases in VIA: https://varindoapp.com/purchases`;

      await sendMail({
        to: ALERT_TO,
        subject: `VIA Alert: ${newGaps.length} Confirmed SO${newGaps.length === 1 ? '' : 's'} not Ordered today`,
        text,
        html,
      });
      emailed = true;
    }

    await logPurchaseGaps(gaps, today, true);

    return NextResponse.json({ success: true, gap_count: gaps.length, new_count: newGaps.length, emailed });
  } catch (err) {
    console.error('[PurchaseGapCheck] error:', err);
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
