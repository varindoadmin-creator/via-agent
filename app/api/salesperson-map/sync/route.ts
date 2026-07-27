import { NextRequest, NextResponse } from 'next/server';
import { runSalespersonSync } from '@/lib/salespersonMap/sync';
import { recordCronRun } from '@/lib/cron/runLog';

export const maxDuration = 300;

// Triggered daily at 09:00 Asia/Jakarta by an external cron-job.org scheduled
// job (see middleware.ts for the x-cron-secret auth bypass — Hostinger's
// Node.js Web App hosting has no cron support of its own), with the default
// body (mode: 'incremental'). Also callable manually while authenticated —
// the Dashboard "Run Salesperson Sync Now" button, and the one-time
// mode: 'backfill' historical fix.
export async function POST(request: NextRequest) {
  const startedAt = new Date().toISOString();
  try {
    let body: { mode?: 'incremental' | 'backfill'; dryRun?: boolean } = {};
    try { body = await request.json(); } catch { /* empty body from cron is fine */ }

    const result = await runSalespersonSync({ mode: body.mode, dryRun: body.dryRun });
    await recordCronRun('salesperson-map-sync', 'success', startedAt, result as unknown as Record<string, unknown>);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error('[SalespersonSync] Route error:', err);
    const error = err instanceof Error ? err.message : String(err);
    await recordCronRun('salesperson-map-sync', 'failed', startedAt, {}, error);
    return NextResponse.json({ success: false, error }, { status: 500 });
  }
}
