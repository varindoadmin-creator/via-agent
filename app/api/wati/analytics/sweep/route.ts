import { NextResponse } from 'next/server';
import { recordCronRun } from '@/lib/cron/runLog';
import { sendMail } from '@/lib/email/sendMail';
import { isAnomalyDetectionEnabled } from '@/lib/customerIdentity/featureFlags';
import { resolveTimeGrain, previousPeriod } from '@/lib/analytics/periods';
import { getCustomerServiceFunnel } from '@/lib/analytics/customerServiceAnalytics';
import { getVendorPerformance } from '@/lib/analytics/stockAnalytics';
import { detectSlaBreachAnomaly, detectVendorResponseTimeAnomaly, type Anomaly } from '@/lib/analytics/anomalyDetection';

export const maxDuration = 120;

const ALERT_TO = process.env.VIA_ALERT_EMAIL || 'varindo.admin@gmail.com';

/**
 * Triggered periodically by an external cron-job.org scheduled job (see
 * middleware.ts CRON_PATHS), same pattern as app/api/wati/service/sweep —
 * runs the simple rule-based threshold checks in lib/analytics/anomalyDetection.ts
 * against today's customer-service and vendor-performance metrics, and sends
 * one bounded summary email when a threshold is exceeded (brief section 81).
 */
export async function POST() {
  const startedAt = new Date().toISOString();
  if (!isAnomalyDetectionEnabled()) {
    await recordCronRun('wati-analytics-sweep', 'success', startedAt, { skipped: 'ANOMALY_DETECTION_ENABLED is off' });
    return NextResponse.json({ success: true, skipped: true });
  }

  try {
    const range = resolveTimeGrain('TODAY');
    const prevRange = previousPeriod(range);

    const [funnel, prevFunnel, vendors] = await Promise.all([
      getCustomerServiceFunnel(range),
      getCustomerServiceFunnel(prevRange),
      getVendorPerformance(range),
    ]);

    const anomalies: Anomaly[] = [];
    const slaAnomaly = detectSlaBreachAnomaly(funnel.slaBreachRate, funnel.handoffCount);
    if (slaAnomaly) anomalies.push(slaAnomaly);
    for (const v of vendors) {
      const vendorAnomaly = detectVendorResponseTimeAnomaly(v.vendor, v.medianResponseMinutes, v.inquiryCount);
      if (vendorAnomaly) anomalies.push(vendorAnomaly);
    }
    // previous-period funnel is read only to keep this sweep's shape consistent
    // with the bottleneck-analysis pattern; today's threshold checks above are
    // absolute, not comparative (brief section 80's "simple rule-based" scope).
    void prevFunnel;

    let emailed = false;
    if (anomalies.length > 0) {
      const rows = anomalies.map(a => `<tr><td style="padding:6px 10px;border-bottom:1px solid #e5e5e5">${a.type.replace(/_/g, ' ')}</td><td style="padding:6px 10px;border-bottom:1px solid #e5e5e5">${a.message}</td></tr>`).join('');
      const html = `<p>${anomalies.length} operational anomal${anomalies.length === 1 ? 'y' : 'ies'} detected today:</p>
        <table style="border-collapse:collapse;width:100%;max-width:640px">
          <thead><tr style="background:#f5f5f5;text-align:left;font-size:12px;text-transform:uppercase;color:#666"><th style="padding:6px 10px">Type</th><th style="padding:6px 10px">Detail</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <p style="margin-top:16px"><a href="https://via-601025884976.asia-southeast2.run.app/requests/wati/analytics">Open Customer Operations Analytics in VIA →</a></p>`;
      await sendMail({ to: ALERT_TO, subject: `VIA Alert: ${anomalies.length} operational anomal${anomalies.length === 1 ? 'y' : 'ies'} detected`, html });
      emailed = true;
    }

    await recordCronRun('wati-analytics-sweep', 'success', startedAt, { anomalies: anomalies.length, emailed });
    return NextResponse.json({ success: true, anomalies: anomalies.length, emailed });
  } catch (err) {
    await recordCronRun('wati-analytics-sweep', 'failed', startedAt, {}, err instanceof Error ? err.message : String(err));
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
