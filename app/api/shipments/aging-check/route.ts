import { NextResponse } from 'next/server';
import { findAgingUndeliveredPackages } from '@/lib/shipmentAging/check';
import { logAgingPackages } from '@/lib/shipmentAging/log';
import { sendMail } from '@/lib/email/sendMail';

const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;
const ALERT_TO = process.env.VIA_ALERT_EMAIL || 'varindo.admin@gmail.com';

function jakartaDateStr(): string {
  return new Date(Date.now() + JAKARTA_OFFSET_MS).toISOString().split('T')[0];
}

// Live check for the in-app alert on Home — always reflects current Zoho
// state (self-clears once a package is actually delivered), independent of
// whether/when the cron below last ran.
export async function GET() {
  try {
    const packages = await findAgingUndeliveredPackages();
    return NextResponse.json({ success: true, packages });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

// Triggered daily at 09:00 Asia/Jakarta by an external cron-job.org scheduled
// job (see middleware.ts for the x-cron-secret auth bypass — Hostinger's
// Node.js Web App hosting has no cron support of its own). Also callable
// manually while authenticated in the app, for testing.
//
// Flags packages still not delivered a day or more after being dispatched
// (or, less often in this org, never even marked shipped) — the shipments
// that were meant to arrive but didn't (traffic, courier no-show, etc.) — so
// it's caught the next morning instead of days later. Emails every run while
// any are still stuck, not just the first day, since an unresolved failure
// staying silent after day one defeats the point.
export async function POST() {
  try {
    const packages = await findAgingUndeliveredPackages();
    const today = jakartaDateStr();

    if (packages.length === 0) {
      return NextResponse.json({ success: true, package_count: 0, emailed: false });
    }

    const rows = packages.map(p => `
      <tr>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e5e5;font-family:monospace">${p.salesorder_number || '—'}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e5e5">${p.customer_name || '(unnamed)'}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e5e5;font-family:monospace">${p.package_number}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e5e5">${p.status === 'shipped' ? 'Shipped, not delivered' : 'Never shipped'}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e5e5;text-align:right">${p.days_aging} day${p.days_aging === 1 ? '' : 's'}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e5e5">${p.carrier || '—'}</td>
      </tr>`).join('');

    const html = `
      <p>${packages.length} package${packages.length === 1 ? ' has' : 's have'} not been delivered a day or more after being dispatched:</p>
      <table style="border-collapse:collapse;width:100%;max-width:720px">
        <thead>
          <tr style="background:#f5f5f5;text-align:left;font-size:12px;text-transform:uppercase;color:#666">
            <th style="padding:6px 10px">SO Number</th>
            <th style="padding:6px 10px">Customer</th>
            <th style="padding:6px 10px">Package</th>
            <th style="padding:6px 10px">Status</th>
            <th style="padding:6px 10px;text-align:right">Aging</th>
            <th style="padding:6px 10px">Carrier</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="margin-top:16px"><a href="https://varindoapp.com/inventory/shipments">Open Shipments in VIA →</a></p>
      <p style="color:#999;font-size:12px;margin-top:24px">Checked at 09:00 Asia/Jakarta. Stays on this list every morning until the package is marked Delivered.</p>
    `;
    const text = `${packages.length} package(s) not delivered a day or more after being dispatched:\n\n` +
      packages.map(p => `${p.salesorder_number || '—'} — ${p.customer_name || '(unnamed)'} — ${p.package_number} — ${p.status === 'shipped' ? 'shipped, not delivered' : 'never shipped'} — ${p.days_aging}d — ${p.carrier || 'no carrier'}`).join('\n') +
      `\n\nOpen Shipments in VIA: https://varindoapp.com/inventory/shipments`;

    await sendMail({
      to: ALERT_TO,
      subject: `VIA Alert: ${packages.length} shipment${packages.length === 1 ? '' : 's'} not delivered`,
      text,
      html,
    });

    await logAgingPackages(packages, today);

    return NextResponse.json({ success: true, package_count: packages.length, emailed: true });
  } catch (err) {
    console.error('[ShipmentAgingCheck] error:', err);
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
