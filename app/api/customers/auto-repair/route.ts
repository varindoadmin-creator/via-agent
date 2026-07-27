import { NextResponse } from 'next/server';
import { runAutoRepairForNewCustomers } from '@/lib/customerCleanup/autoRepair';
import { recordCronRun } from '@/lib/cron/runLog';

export const maxDuration = 300;

// Triggered daily at 09:00 Asia/Jakarta by an external cron-job.org scheduled
// job (see middleware.ts for the x-cron-secret auth bypass — Hostinger's
// Node.js Web App hosting has no cron support of its own). Also callable
// manually while authenticated in the app, for testing.
export async function POST() {
  const startedAt = new Date().toISOString();
  try {
    const result = await runAutoRepairForNewCustomers();
    await recordCronRun('customers-auto-repair', 'success', startedAt, result as unknown as Record<string, unknown>);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error('[AutoRepair] Manual trigger error:', err);
    const error = err instanceof Error ? err.message : String(err);
    await recordCronRun('customers-auto-repair', 'failed', startedAt, {}, error);
    return NextResponse.json({ success: false, error }, { status: 500 });
  }
}
