import { NextRequest, NextResponse } from 'next/server';
import { listStaleExecutingActions, markActionForManualReconciliation } from '@/lib/jarvis/approvals/store';

/** Cron-only recovery: never repeats an external write with an unknown outcome. */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET || '';
  if (!secret || req.headers.get('x-cron-secret') !== secret) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const staleMinutes = Math.max(5, Math.min(120, Number(process.env.JARVIS_ACTION_STALE_MINUTES) || 15));
  const before = new Date(Date.now() - staleMinutes * 60_000).toISOString();
  try {
    const actions = await listStaleExecutingActions(before);
    for (const action of actions) await markActionForManualReconciliation(action.id);
    return NextResponse.json({ ok: true, reconciled: actions.length, mode: 'manual_reconciliation_required' });
  } catch (error) {
    console.error('[jarvis.recovery]', error);
    return NextResponse.json({ error: 'Recovery inspection failed.' }, { status: 503 });
  }
}
