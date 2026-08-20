import { NextResponse } from 'next/server';
import { recordCronRun } from '@/lib/cron/runLog';
import { repairMissingDocumentNpwp } from '@/lib/zoho/npwpRepair';

export const maxDuration = 300;

export async function POST() {
  const startedAt = new Date().toISOString();
  try {
    const result = await repairMissingDocumentNpwp();
    await recordCronRun('documents-npwp-repair', result.failed.length ? 'failed' : 'success', startedAt, result as unknown as Record<string, unknown>, result.failed.length ? `${result.failed.length} document updates failed` : undefined);
    return NextResponse.json({ success: result.failed.length === 0, ...result }, { status: result.failed.length ? 207 : 200 });
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : String(cause);
    await recordCronRun('documents-npwp-repair', 'failed', startedAt, {}, error);
    return NextResponse.json({ success: false, error }, { status: 500 });
  }
}
