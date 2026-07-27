import { NextResponse } from 'next/server';
import { runAutoConvertReadyShipments } from '@/lib/shipments/autoInvoice';
import { recordCronRun } from '@/lib/cron/runLog';

export const maxDuration = 300;

// Triggered daily at 09:00 Asia/Jakarta by an external cron-job.org scheduled
// job (see middleware.ts for the x-cron-secret auth bypass — Hostinger's
// Node.js Web App hosting has no cron support of its own). Also callable
// manually while authenticated in the app, for testing.
export async function POST() {
  const startedAt = new Date().toISOString();
  try {
    const result = await runAutoConvertReadyShipments();
    await recordCronRun('shipments-auto-invoice', 'success', startedAt, result as unknown as Record<string, unknown>);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error('[AutoInvoice] Manual trigger error:', err);
    const error = err instanceof Error ? err.message : String(err);
    await recordCronRun('shipments-auto-invoice', 'failed', startedAt, {}, error);
    return NextResponse.json({ success: false, error }, { status: 500 });
  }
}
