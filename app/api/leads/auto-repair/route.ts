import { NextResponse } from 'next/server';
import { recordCronRun } from '@/lib/cron/runLog';
import { runLeadAutoRepair } from '@/lib/leadCleanup/autoRepair';

export const maxDuration = 300;

export async function POST() {
  const startedAt = new Date().toISOString();
  try {
    const result = await runLeadAutoRepair();
    const status = result.failed.length ? 'failed' : 'success';
    await recordCronRun('leads-auto-repair', status, startedAt, result as unknown as Record<string, unknown>, result.failed.length ? `${result.failed.length} records failed` : null);
    return NextResponse.json({ success: result.failed.length === 0, ...result }, { status: result.failed.length ? 207 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordCronRun('leads-auto-repair', 'failed', startedAt, {}, message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
