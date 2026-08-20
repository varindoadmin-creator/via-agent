import { NextResponse } from 'next/server';
import { findSameDayPurchaseGaps } from '@/lib/purchaseGap/check';
import { getLoggedGapIds, logPurchaseGaps } from '@/lib/purchaseGap/log';
import { sendMail } from '@/lib/email/sendMail';
import { recordCronRun } from '@/lib/cron/runLog';

export const maxDuration = 300;

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
  const startedAt = new Date().toISOString();
  try {
    const gaps = await findSameDayPurchaseGaps();
    const today = jakartaDateStr();

    if (gaps.length === 0) {
      await recordCronRun('salesorders-purchase-gap-check', 'success', startedAt, {
        gap_count: 0,
        emailed: false,
      });
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
          <td style="padding:6px 10px;border-bottom:1px solid #e5e5e5">${g.locations.join(', ') || 'HUB not assigned'}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #e5e5e5">${g.uncovered_items.map(item => `${item.sku || item.item_name}: need ${item.required_quantity}, stock ${item.stock_on_hand}`).join('<br>')}</td>
        </tr>`).join('');

      const html = `
        <p>${newGaps.length} confirmed Sales Order${newGaps.length === 1 ? ' has' : 's have'} item demand that is neither Ordered nor Stock Ready at the assigned HUB:</p>
        <table style="border-collapse:collapse;width:100%;max-width:640px">
          <thead>
            <tr style="background:#f5f5f5;text-align:left;font-size:12px;text-transform:uppercase;color:#666">
              <th style="padding:6px 10px">SO Number</th>
              <th style="padding:6px 10px">Customer</th>
              <th style="padding:6px 10px;text-align:right">Total</th>
              <th style="padding:6px 10px">HUB</th>
              <th style="padding:6px 10px">Uncovered Items</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <p style="margin-top:16px"><a href="https://varindoapp.com/purchases">Open Purchases in VIA →</a></p>
        <p style="color:#999;font-size:12px;margin-top:24px">Checked daily at 15:00 Asia/Jakarta. Confirmation date is not used, so weekends and purchasing lead time do not cause false positives.</p>
      `;
      const text = `${newGaps.length} confirmed Sales Order(s) have items without PO or stock coverage:\n\n` +
        newGaps.map(g => `${g.salesorder_number} — ${g.customer_name || '(unnamed)'} — ${g.locations.join(', ') || 'HUB not assigned'} — ${g.uncovered_items.map(item => `${item.sku || item.item_name}: need ${item.required_quantity}, stock ${item.stock_on_hand}`).join('; ')}`).join('\n') +
        `\n\nOpen Purchases in VIA: https://varindoapp.com/purchases`;

      await sendMail({
        to: ALERT_TO,
        subject: `VIA Alert: ${newGaps.length} Confirmed SO${newGaps.length === 1 ? '' : 's'} without stock or PO coverage`,
        text,
        html,
      });
      emailed = true;
    }

    await logPurchaseGaps(gaps, today, true);

    await recordCronRun('salesorders-purchase-gap-check', 'success', startedAt, {
      gap_count: gaps.length,
      new_count: newGaps.length,
      emailed,
    });
    return NextResponse.json({ success: true, gap_count: gaps.length, new_count: newGaps.length, emailed });
  } catch (err) {
    console.error('[PurchaseGapCheck] error:', err);
    const error = err instanceof Error ? err.message : String(err);
    await recordCronRun('salesorders-purchase-gap-check', 'failed', startedAt, {}, error);
    return NextResponse.json({ success: false, error }, { status: 500 });
  }
}
