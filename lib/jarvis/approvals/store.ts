import { randomUUID } from 'node:crypto';
import type { Role } from '@/lib/auth';

const TABLE = 'jarvis_pending_actions';

function database() {
  const base = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
  if (!base || !key) throw new Error('JARVIS approval storage is not configured.');
  return {
    url: `${base}/rest/v1/${TABLE}`,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  };
}

export interface PendingSalesOrderPayload {
  customer_id: string;
  items: Array<{ item_id: string; quantity: number; rate: number; unit: string; description: string }>;
  notes: string;
}

export interface PendingJarvisAction {
  id: string;
  conversation_id: string;
  requested_by: Role;
  action_type: 'create_sales_order';
  status: 'pending' | 'executing' | 'completed' | 'failed' | 'expired';
  payload: PendingSalesOrderPayload;
  preview: Record<string, unknown>;
  expires_at: string;
}

export async function savePendingSalesOrder(input: {
  conversationId: string;
  role: Role;
  payload: PendingSalesOrderPayload;
  preview: Record<string, unknown>;
}): Promise<string> {
  const db = database();
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const response = await fetch(db.url, {
    method: 'POST',
    headers: { ...db.headers, Prefer: 'return=minimal' },
    body: JSON.stringify({
      id,
      conversation_id: input.conversationId,
      requested_by: input.role,
      action_type: 'create_sales_order',
      payload: input.payload,
      preview: input.preview,
      expires_at: expiresAt,
      // Kept behind the schema flag so existing deployments remain compatible
      // until supabase/jarvis_reliability.sql has been applied.
      ...(process.env.JARVIS_RELIABILITY_SCHEMA_ENABLED === 'true'
        ? { idempotency_key: `jarvis:create_sales_order:${id}`, workflow_version: 1 }
        : {}),
    }),
  });
  if (!response.ok) throw new Error(`Unable to save JARVIS approval preview (${response.status}).`);
  return id;
}

export async function claimPendingSalesOrder(input: {
  id: string;
  conversationId: string;
  role: Role;
}): Promise<PendingJarvisAction | null> {
  const db = database();
  const query = `?id=eq.${encodeURIComponent(input.id)}&conversation_id=eq.${encodeURIComponent(input.conversationId)}&requested_by=eq.${input.role}&status=eq.pending&expires_at=gt.${encodeURIComponent(new Date().toISOString())}`;
  const response = await fetch(`${db.url}${query}`, {
    method: 'PATCH',
    headers: { ...db.headers, Prefer: 'return=representation' },
    body: JSON.stringify({ status: 'executing', approved_at: new Date().toISOString() }),
  });
  if (!response.ok) throw new Error(`Unable to claim JARVIS approval (${response.status}).`);
  const rows = await response.json() as PendingJarvisAction[];
  return rows[0] || null;
}

export async function finishPendingAction(id: string, result: {
  status: 'completed' | 'failed';
  zoho_object_id?: string;
  zoho_object_number?: string;
  error?: string;
}): Promise<void> {
  const db = database();
  const response = await fetch(`${db.url}?id=eq.${encodeURIComponent(id)}&status=eq.executing`, {
    method: 'PATCH',
    headers: db.headers,
    body: JSON.stringify({ ...result, completed_at: new Date().toISOString(), ...(process.env.JARVIS_RELIABILITY_SCHEMA_ENABLED === 'true' ? { updated_at: new Date().toISOString() } : {}) }),
  });
  if (!response.ok) throw new Error(`Unable to finalize JARVIS approval (${response.status}).`);
}

/** Reads only stuck executions. Recovery must reconcile externally; it never repeats a Zoho write. */
export async function listStaleExecutingActions(staleBefore: string): Promise<PendingJarvisAction[]> {
  const db = database();
  const response = await fetch(`${db.url}?status=eq.executing&approved_at=lt.${encodeURIComponent(staleBefore)}&select=id,conversation_id,requested_by,action_type,status,payload,preview,expires_at`, { headers: db.headers });
  if (!response.ok) throw new Error(`Unable to inspect JARVIS action recovery queue (${response.status}).`);
  return response.json() as Promise<PendingJarvisAction[]>;
}

export async function markActionForManualReconciliation(id: string): Promise<void> {
  const db = database();
  const response = await fetch(`${db.url}?id=eq.${encodeURIComponent(id)}&status=eq.executing`, {
    method: 'PATCH', headers: db.headers,
    body: JSON.stringify({ status: 'failed', error: 'Execution outcome unknown; check Zoho Books before preparing a replacement.', completed_at: new Date().toISOString() }),
  });
  if (!response.ok) throw new Error(`Unable to mark stale JARVIS action (${response.status}).`);
}
