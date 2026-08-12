import { NextResponse } from 'next/server';
import { scanCustomerDuplicates } from '@/lib/customerDuplicates/scan';
import { getLatestDuplicateScan } from '@/lib/customerDuplicates/snapshotStore';
import { recordCronRun } from '@/lib/cron/runLog';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json({ success: true, scan: await getLatestDuplicateScan() });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function POST() {
  const startedAt = new Date().toISOString();
  try {
    const result = await scanCustomerDuplicates();
    const summary = {
      total_customers: result.totalCustomers,
      duplicate_groups: result.groups.length,
      duplicate_customers: result.groups.reduce((sum, group) => sum + group.customers.length, 0),
      ignored_groups: result.ignoredCount,
      groups: result.groups,
    };
    await recordCronRun('customers-duplicate-check', 'success', startedAt, summary);
    return NextResponse.json({ success: true, ...summary, groups: result.groups });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordCronRun('customers-duplicate-check', 'failed', startedAt, {}, message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
