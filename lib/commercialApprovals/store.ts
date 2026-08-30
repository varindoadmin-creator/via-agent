// ─── Commercial approvals store ──────────────────────────────────────────────
// Brief sections 12, 43-44: the admin-review equivalent of
// lib/jarvis/approvals/store.ts's claim-with-status-filter pattern, but not
// scoped to a chat conversation/role-claim — the approver here is an
// authenticated admin/director reviewing a WATI-originated draft from a
// dashboard, never the WATI customer themselves (brief section 62).

import { supabaseSelect, supabaseInsert, supabasePatch } from '../supabase/rest.ts';

const TABLE = 'commercial_approvals';

export type ApprovalDraftType = 'CUSTOMER' | 'COMMERCIAL';
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'EXECUTING' | 'COMPLETED' | 'FAILED' | 'REJECTED' | 'EXPIRED';

export interface CommercialApproval {
  id: string;
  draft_type: ApprovalDraftType;
  draft_id: string;
  draft_version: number;
  draft_hash: string;
  status: ApprovalStatus;
  requested_at: string;
  approved_by: string | null;
  approved_at: string | null;
  executed_at: string | null;
  zoho_object_id: string | null;
  zoho_object_number: string | null;
  error: string | null;
}

export async function requestApproval(input: { draftType: ApprovalDraftType; draftId: string; draftVersion: number; draftHash: string }): Promise<CommercialApproval> {
  const row = await supabaseInsert<CommercialApproval>(TABLE, {
    draft_type: input.draftType,
    draft_id: input.draftId,
    draft_version: input.draftVersion,
    draft_hash: input.draftHash,
  });
  if (!row) throw new Error('Approval request was not created.');
  return row;
}

/** Marks a pending approval as approved by an authenticated internal user. Never callable by WATI's inbound path (brief section 62). */
export async function approveRequest(id: string, approvedBy: string): Promise<CommercialApproval | null> {
  const rows = await supabasePatch<CommercialApproval>(TABLE, `id=eq.${encodeURIComponent(id)}&status=eq.PENDING`, {
    status: 'APPROVED', approved_by: approvedBy, approved_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  });
  return rows[0] ?? null;
}

export async function rejectRequest(id: string, rejectedBy: string): Promise<void> {
  await supabasePatch(TABLE, `id=eq.${encodeURIComponent(id)}&status=eq.PENDING`, {
    status: 'REJECTED', approved_by: rejectedBy, approved_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  });
}

/** Atomically claims an APPROVED approval for execution — a duplicate execution attempt (retry/duplicate webhook) finds no row and no-ops. */
export async function claimApprovalForExecution(id: string): Promise<CommercialApproval | null> {
  const rows = await supabasePatch<CommercialApproval>(TABLE, `id=eq.${encodeURIComponent(id)}&status=eq.APPROVED`, {
    status: 'EXECUTING', updated_at: new Date().toISOString(),
  });
  return rows[0] ?? null;
}

export async function finishApproval(id: string, result: { status: 'COMPLETED' | 'FAILED'; zohoObjectId?: string; zohoObjectNumber?: string; error?: string }): Promise<void> {
  await supabasePatch(TABLE, `id=eq.${encodeURIComponent(id)}&status=eq.EXECUTING`, {
    status: result.status,
    zoho_object_id: result.zohoObjectId ?? null,
    zoho_object_number: result.zohoObjectNumber ?? null,
    error: result.error ? result.error.slice(0, 1000) : null,
    executed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}

/** Marks an approval whose Zoho outcome is unknown (timeout/ambiguous response) for manual reconciliation — never auto-retried (brief sections 14, 47-48). */
export async function markExecutionUnknown(id: string): Promise<void> {
  await supabasePatch(TABLE, `id=eq.${encodeURIComponent(id)}&status=eq.EXECUTING`, {
    status: 'FAILED',
    error: 'EXECUTION_UNKNOWN: Zoho outcome could not be confirmed. Do not retry; reconcile manually in Zoho Books before preparing a replacement.',
    executed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}

export async function getApproval(id: string): Promise<CommercialApproval | null> {
  const rows = await supabaseSelect<CommercialApproval>(TABLE, `id=eq.${encodeURIComponent(id)}&select=*`);
  return rows[0] ?? null;
}

export async function listApprovalsByStatus(statuses: ApprovalStatus[]): Promise<CommercialApproval[]> {
  return supabaseSelect<CommercialApproval>(TABLE, `status=in.(${statuses.join(',')})&select=*&order=requested_at.desc&limit=200`);
}
