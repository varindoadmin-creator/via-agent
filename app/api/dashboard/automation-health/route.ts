import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;
const GRACE_MS = 30 * 60 * 1000;

const JOBS = [
  { name: 'customers-auto-repair', label: 'Repair Customer Data', hour: 9, minute: 5 },
  { name: 'documents-npwp-repair', label: 'Fill Missing NPWP on Sales Documents', hour: 9, minute: 8 },
  { name: 'shipments-auto-invoice', label: 'Convert Ready Shipments', hour: 9, minute: 0 },
  { name: 'invoices-auto-send', label: 'Mark Ready Draft Invoices as Sent', hour: 9, minute: 10 },
  { name: 'inventory-price-list-sync', label: 'Synchronize Inventory Price Lists', hour: 9, minute: 15 },
  { name: 'salesperson-map-sync', label: 'Assign Salespersons', hour: 9, minute: 20 },
  { name: 'shipments-aging-check', label: 'Shipment Aging Check', hour: 9, minute: 25 },
  { name: 'data-quality-monitor', label: 'Monitor Data Quality', hour: 9, minute: 30 },
  { name: 'customers-duplicate-check', label: 'Check Duplicate Customers', hour: 9, minute: 35 },
  { name: 'leads-auto-repair', label: 'Normalize Leads and Sub-Dealer Data', hour: 9, minute: 40 },
  { name: 'salesorders-purchase-gap-check', label: 'Sales Order Purchase-Gap Check', hour: 15, minute: 0 },
] as const;

type RunRow = {
  job_name: string;
  status: 'success' | 'failed';
  started_at: string;
  finished_at: string;
  summary: Record<string, unknown> | null;
  error: string | null;
};

function scheduledUtc(now: Date, hour: number, minute: number) {
  const jakartaNow = new Date(now.getTime() + JAKARTA_OFFSET_MS);
  return new Date(Date.UTC(
    jakartaNow.getUTCFullYear(), jakartaNow.getUTCMonth(), jakartaNow.getUTCDate(),
    hour - 7, minute, 0, 0,
  ));
}

export async function GET() {
  try {
    const base = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!base || !key) throw new Error('Supabase is not configured');

    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const url = `${base}/rest/v1/cron_run_log?select=job_name,status,started_at,finished_at,summary,error&finished_at=gte.${encodeURIComponent(since)}&order=finished_at.desc&limit=500`;
    const res = await fetch(url, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
    const rows = await res.json() as RunRow[];
    const now = new Date();

    const jobs = JOBS.map(job => {
      const runs = rows.filter(row => row.job_name === job.name);
      const latest = runs[0] || null;
      const lastSuccess = runs.find(row => row.status === 'success') || null;
      const todayExpected = scheduledUtc(now, job.hour, job.minute);
      const due = now.getTime() > todayExpected.getTime() + GRACE_MS;
      const ranForExpectedWindow = Boolean(latest && new Date(latest.finished_at) >= todayExpected);
      const missing = due && !ranForExpectedWindow;
      const failed = Boolean(latest?.status === 'failed' && new Date(latest.finished_at) >= todayExpected);
      const nextExpected = ranForExpectedWindow || due
        ? new Date(todayExpected.getTime() + 24 * 60 * 60 * 1000)
        : todayExpected;

      return {
        name: job.name,
        label: job.label,
        schedule: `${String(job.hour).padStart(2, '0')}:${String(job.minute).padStart(2, '0')}`,
        status: failed ? 'failed' : missing ? 'missing' : ranForExpectedWindow ? 'healthy' : 'pending',
        lastRunAt: latest?.finished_at || null,
        lastSuccessAt: lastSuccess?.finished_at || null,
        nextExpectedAt: nextExpected.toISOString(),
        summary: latest?.summary || {},
        error: latest?.error || null,
      };
    });

    const invoiceRuns = rows.filter(row => row.job_name === 'invoices-auto-send' && row.status === 'success');
    const latestInvoiceSummary = invoiceRuns[0]?.summary || {};
    const draftReadiness = Array.isArray(latestInvoiceSummary.readiness_issues) ? latestInvoiceSummary.readiness_issues : [];
    const consecutiveSkippedRuns = invoiceRuns.findIndex(row => Number(row.summary?.skipped || 0) === 0);
    const repeatedDraftSkips = consecutiveSkippedRuns === -1 ? invoiceRuns.length : consecutiveSkippedRuns;
    const alerts = jobs
      .filter(job => job.status === 'missing' || job.status === 'failed')
      .map(job => ({ severity: 'critical', message: `${job.label}: ${job.status === 'failed' ? 'latest run failed' : 'scheduled heartbeat is missing'}` }));

    if (repeatedDraftSkips >= 2) {
      alerts.push({ severity: 'warning', message: `Draft invoices were skipped for insufficient stock in ${repeatedDraftSkips} consecutive runs.` });
    }

    return NextResponse.json({
      success: true,
      healthy: alerts.length === 0,
      checkedAt: now.toISOString(),
      graceMinutes: GRACE_MS / 60000,
      jobs,
      alerts,
      draftReadiness,
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
