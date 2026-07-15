import { NextResponse } from 'next/server';
import { runAutoRepairForNewCustomers } from '@/lib/customerCleanup/autoRepair';

// Triggered daily at 09:00 Asia/Jakarta by an external cron-job.org scheduled
// job (see middleware.ts for the x-cron-secret auth bypass — Hostinger's
// Node.js Web App hosting has no cron support of its own). Also callable
// manually while authenticated in the app, for testing.
export async function POST() {
  try {
    const result = await runAutoRepairForNewCustomers();
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error('[AutoRepair] Manual trigger error:', err);
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
