export interface ExecutingWorkflow { status: 'executing'; approvedAt?: string | null; expiresAt: string; }
export function needsManualReconciliation(workflow: ExecutingWorkflow, now = Date.now(), staleAfterMs = 5 * 60_000): boolean {
  const started = workflow.approvedAt ? Date.parse(workflow.approvedAt) : 0;
  return !Number.isFinite(started) || now - started >= staleAfterMs || Date.parse(workflow.expiresAt) <= now;
}
