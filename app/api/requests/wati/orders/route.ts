import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function database() {
  const base = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
  if (!base || !key) return null;
  return { base, headers: { apikey: key, Authorization: `Bearer ${key}` } };
}

type DraftRow = Record<string, unknown> & { id: string };
type LineRow = Record<string, unknown> & { commercial_draft_id: string };

// GET /api/requests/wati/orders — the Customer Orders dashboard (brief
// section 66): Needs Customer / Onboarding / Needs Address / Needs Product /
// Needs Quantity / Waiting Stock / Needs Price / Ready Review / Waiting
// Approval / Execution Issue / Completed.
export async function GET() {
  const db = database();
  if (!db) return NextResponse.json({ success: false, error: 'Commercial draft storage is not configured.' }, { status: 503 });

  try {
    const params = new URLSearchParams({ select: '*', status: 'not.in.(CANCELLED)', order: 'updated_at.desc', limit: '200' });
    const response = await fetch(`${db.base}/rest/v1/commercial_drafts?${params.toString()}`, { headers: db.headers, cache: 'no-store' });
    if (!response.ok) throw new Error(`Supabase returned ${response.status}`);
    const drafts = await response.json() as DraftRow[];

    const draftIds = drafts.map(d => d.id);
    let linesByDraft = new Map<string, LineRow[]>();
    if (draftIds.length > 0) {
      const lineParams = new URLSearchParams({ commercial_draft_id: `in.(${draftIds.join(',')})`, select: '*', order: 'line_order.asc' });
      const lineRes = await fetch(`${db.base}/rest/v1/commercial_draft_lines?${lineParams.toString()}`, { headers: db.headers, cache: 'no-store' });
      if (lineRes.ok) {
        const rows = await lineRes.json() as LineRow[];
        linesByDraft = new Map();
        for (const row of rows) {
          const list = linesByDraft.get(row.commercial_draft_id) || [];
          list.push(row);
          linesByDraft.set(row.commercial_draft_id, list);
        }
      }
    }

    const items = drafts.map(draft => ({ ...draft, lines: linesByDraft.get(draft.id) || [] }));
    return NextResponse.json({ success: true, drafts: items });
  } catch (error) {
    console.error('[WatiOrdersDashboard]', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ success: false, error: 'Unable to load commercial drafts.' }, { status: 500 });
  }
}
