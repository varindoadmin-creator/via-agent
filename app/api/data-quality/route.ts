import { NextResponse } from 'next/server';
import { recordCronRun } from '@/lib/cron/runLog';
import { runDataQualityMonitor } from '@/lib/dataQuality/run';

export const maxDuration = 300;

async function execute(isCron: boolean) {
  const startedAt = new Date().toISOString();
  try {
    const result = await runDataQualityMonitor();
    if (isCron) await recordCronRun('data-quality-monitor', 'success', startedAt, { issue_count: result.issues.length, severity: result.severity, scanned: result.scanned });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isCron) await recordCronRun('data-quality-monitor', 'failed', startedAt, {}, message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function GET() { return execute(false); }
export async function POST() { return execute(true); }
