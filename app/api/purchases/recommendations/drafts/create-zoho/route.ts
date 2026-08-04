import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/auth';
import { assertMirpoPolicyQuantity, canCreateMirpoDraft, validateDraftItems } from '@/lib/purchasing/draftValidation';
import { createZohoDraftMirpo } from '@/lib/zoho/createMirpoPO';

export const maxDuration = 120;
const table = 'mirpo_recommendation_drafts';

function supabase() {
  const base = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!base || !key) throw new Error('Supabase is not configured');
  return { base, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

async function updateDraft(db: ReturnType<typeof supabase>, id: string, body: Record<string, unknown>, status?: string) {
  const statusFilter = status ? `&status=eq.${encodeURIComponent(status)}` : '';
  const response = await fetch(`${db.base}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}${statusFilter}`, {
    method: 'PATCH', headers: { ...db.headers, Prefer: 'return=representation' }, body: JSON.stringify(body), cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${await response.text()}`);
  return await response.json() as Record<string, unknown>[];
}

export async function POST(request: NextRequest) {
  const role = await verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!canCreateMirpoDraft(role)) return NextResponse.json({ success: false, error: role ? 'Director approval is required' : 'Unauthorized' }, { status: role ? 403 : 401 });
  let id = '';
  let db: ReturnType<typeof supabase> | null = null;
  let zohoCreated = false;
  try {
    const body = await request.json();
    id = String(body.draft_id || '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ success: false, error: 'A valid local draft ID is required' }, { status: 400 });
    db = supabase();
    const lookup = await fetch(`${db.base}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}&select=*&limit=1`, { headers: db.headers, cache: 'no-store' });
    if (!lookup.ok) throw new Error(`Supabase ${lookup.status}: ${await lookup.text()}`);
    const draft = (await lookup.json())[0] as Record<string, unknown> | undefined;
    if (!draft) return NextResponse.json({ success: false, error: 'Local MIRPO draft not found' }, { status: 404 });
    if (draft.zoho_purchaseorder_id) return NextResponse.json({ success: true, already_created: true, purchaseorder_id: draft.zoho_purchaseorder_id, purchaseorder_number: draft.zoho_purchaseorder_number });
    if (draft.status === 'creating_zoho') return NextResponse.json({ success: false, error: 'This MIRPO is already being created in Zoho' }, { status: 409 });

    const items = validateDraftItems(draft.items);
    assertMirpoPolicyQuantity(items);
    const lines = items.filter((item) => !item.excluded && item.quantity > 0).map((item) => ({ item_id: item.item_id, quantity: item.quantity }));
    const claimed = await updateDraft(db, id, { status: 'creating_zoho', updated_by: role, updated_at: new Date().toISOString(), zoho_error: null }, String(draft.status));
    if (claimed.length !== 1) return NextResponse.json({ success: false, error: 'This MIRPO changed before creation; refresh and retry' }, { status: 409 });

    const po = await createZohoDraftMirpo(lines, id);
    zohoCreated = true;
    await updateDraft(db, id, {
      status: 'zoho_draft_created', updated_by: role, updated_at: new Date().toISOString(),
      zoho_purchaseorder_id: po.purchaseorder_id, zoho_purchaseorder_number: po.purchaseorder_number,
      zoho_created_at: new Date().toISOString(), zoho_error: null,
    });
    return NextResponse.json({ success: true, purchaseorder: po });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Create MIRPO in Zoho]', message);
    if (db && id && !zohoCreated) await updateDraft(db, id, { status: 'failed', updated_at: new Date().toISOString(), zoho_error: message }).catch(() => {});
    const safeMessage = zohoCreated
      ? 'Zoho created the PO, but VIA could not finish recording it. Check Zoho Books before retrying to avoid a duplicate.'
      : message;
    return NextResponse.json({ success: false, error: safeMessage }, { status: 500 });
  }
}
