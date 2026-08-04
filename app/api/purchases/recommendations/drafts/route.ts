import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/auth';
import { assertMirpoPolicyQuantity, canCreateMirpoDraft, validateDraftItems } from '@/lib/purchasing/draftValidation';

const table = 'mirpo_recommendation_drafts';

function supabase() {
  const base = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!base || !key) throw new Error('Supabase is not configured');
  return { base, key, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function GET(request: NextRequest) {
  const role = await verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!role) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  try {
    const db = supabase();
    const response = await fetch(`${db.base}/rest/v1/${table}?select=*&status=eq.local_draft&order=updated_at.desc&limit=1`, { headers: db.headers, cache: 'no-store' });
    if (!response.ok) throw new Error(`Supabase ${response.status}: ${await response.text()}`);
    const rows = await response.json();
    return NextResponse.json({ success: true, draft: rows[0] || null });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const role = await verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!canCreateMirpoDraft(role)) return NextResponse.json({ success: false, error: role ? 'Director approval is required' : 'Unauthorized' }, { status: role ? 403 : 401 });
  try {
    const body = await request.json();
    const items = validateDraftItems(body.items);
    assertMirpoPolicyQuantity(items);
    const active = items.filter((item) => !item.excluded && item.quantity > 0);
    if (!active.length) return NextResponse.json({ success: false, error: 'No included item has a positive quantity' }, { status: 400 });
    const db = supabase();
    const row = {
      status: 'local_draft', generated_at: String(body.generated_at || new Date().toISOString()),
      created_by: role, updated_by: role,
      configuration: body.configuration || {}, source_snapshot: body.source_snapshot || {},
      adjustments: body.adjustments || {}, exclusions: body.exclusions || {}, items,
      estimated_total: active.reduce((sum, item) => sum + item.quantity * item.estimated_unit_cost, 0),
    };
    const response = await fetch(`${db.base}/rest/v1/${table}`, {
      method: 'POST', headers: { ...db.headers, Prefer: 'return=representation' }, body: JSON.stringify(row),
    });
    if (!response.ok) throw new Error(`Supabase ${response.status}: ${await response.text()}`);
    const created = (await response.json())[0];
    return NextResponse.json({ success: true, draft: created, zoho_changed: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes('mirpo_recommendation_drafts') ? 503 : 400;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
