import { NextRequest, NextResponse } from 'next/server';
import { runSalespersonSync } from '@/lib/salespersonMap/sync';

// Triggered daily at 09:00 Asia/Jakarta by an external cron-job.org scheduled
// job (see middleware.ts for the x-cron-secret auth bypass — Hostinger's
// Node.js Web App hosting has no cron support of its own), with the default
// body (mode: 'incremental'). Also callable manually while authenticated —
// the Dashboard "Run Salesperson Sync Now" button, and the one-time
// mode: 'backfill' historical fix.
export async function POST(request: NextRequest) {
  try {
    let body: { mode?: 'incremental' | 'backfill'; dryRun?: boolean } = {};
    try { body = await request.json(); } catch { /* empty body from cron is fine */ }

    const result = await runSalespersonSync({ mode: body.mode, dryRun: body.dryRun });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error('[SalespersonSync] Route error:', err);
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
