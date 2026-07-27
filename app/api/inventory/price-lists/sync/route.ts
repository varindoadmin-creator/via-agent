import { NextRequest, NextResponse } from 'next/server';
import { runPriceListSync } from '@/lib/zoho/priceListSync';
import { recordCronRun } from '@/lib/cron/runLog';

// Triggered daily at 09:00 Asia/Jakarta by an external cron-job.org scheduled
// job (see middleware.ts for the x-cron-secret auth bypass — Hostinger's
// Node.js Web App hosting has no cron support of its own), with body
// {"dry_run": false}. Also callable manually while authenticated in the app
// — defaults to dry_run: true so an accidental call never writes to Zoho.
export const maxDuration = 300;

const LOG_TABLE = 'price_list_sync_log';

function supabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
  return { url: url.replace(/\/$/, ''), key };
}

async function logRows(rows: Array<Record<string, unknown>>) {
  if (!rows.length) return;
  const { url, key } = supabaseConfig();
  if (!url || !key) return;
  try {
    const res = await fetch(`${url}/rest/v1/${LOG_TABLE}`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(rows),
    });
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  } catch (err) {
    console.error('[PriceListSync] Logging to Supabase failed:', err);
  }
}

export async function POST(req: NextRequest) {
  const startedAt = new Date().toISOString();
  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = (body as { dry_run?: boolean }).dry_run !== false; // default true — must explicitly pass false to write

    const result = await runPriceListSync(dryRun);

    await logRows(result.rows.map(r => ({
      item_id: r.item_id,
      item_name: r.item_name,
      prefix: r.prefix,
      tier: r.tier,
      action: r.action,
      reason: r.reason || null,
      discount_applied: r.discount_applied || null,
      rate_applied: r.rate_applied ?? null,
      dry_run: dryRun,
    })));

    const added = result.rows.filter(r => r.action === 'added').length;
    const skipped = result.rows.filter(r => r.action === 'skipped').length;
    console.log('[PriceListSync] Run complete:', { dryRun, scanned: result.scanned_items, added, skipped });

    await recordCronRun('inventory-price-list-sync', 'success', startedAt, {
      dry_run: dryRun,
      scanned: result.scanned_items,
      added,
      skipped,
    });
    return NextResponse.json({ success: true, ...result, added, skipped });
  } catch (err) {
    console.error('[PriceListSync] Error:', err);
    const error = err instanceof Error ? err.message : String(err);
    await recordCronRun('inventory-price-list-sync', 'failed', startedAt, {}, error);
    return NextResponse.json({ success: false, error }, { status: 500 });
  }
}
