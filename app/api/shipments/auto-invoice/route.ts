import { NextResponse } from 'next/server';
import { runAutoConvertReadyShipments } from '@/lib/shipments/autoInvoice';

// Manual trigger for the same job instrumentation.ts runs daily at 09:00
// Asia/Jakarta — useful for testing without waiting for the schedule.
export async function POST() {
  try {
    const result = await runAutoConvertReadyShipments();
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error('[AutoInvoice] Manual trigger error:', err);
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
