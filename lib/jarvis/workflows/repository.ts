import type { BusinessEvent, WorkflowInstance, WorkflowStepHistory } from './types.ts';

const INSTANCES = 'jarvis_workflow_instances';
const STEPS = 'jarvis_workflow_step_history';
const EVENTS = 'jarvis_business_events';

export interface WorkflowRepository {
  findByIdempotencyKey(key: string): Promise<WorkflowInstance | null>;
  findById(id: string): Promise<WorkflowInstance | null>;
  create(instance: WorkflowInstance): Promise<WorkflowInstance>;
  save(instance: WorkflowInstance, expectedStatus: WorkflowInstance['status']): Promise<WorkflowInstance>;
  appendStep(step: WorkflowStepHistory): Promise<void>;
  recordEvent(event: BusinessEvent): Promise<'accepted' | 'duplicate'>;
}

function database(table: string) {
  if (process.env.JARVIS_WORKFLOW_SCHEMA_ENABLED !== 'true') throw new Error('JARVIS workflow storage is not enabled. Apply supabase/jarvis_workflows.sql first.');
  const base = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
  if (!base || !key) throw new Error('JARVIS workflow storage is not configured.');
  return { url: `${base}/rest/v1/${table}`, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

function instanceRow(instance: WorkflowInstance) {
  return { id: instance.id, workflow_type: instance.workflowType, workflow_version: instance.workflowVersion, organization_id: instance.organizationId, user_id: instance.userId, trigger_type: instance.triggerType, trigger_reference: instance.triggerReference, status: instance.status, current_step: instance.currentStep, input: instance.input, state: instance.state, required_fields: instance.requiredFields, approval_id: instance.approvalId, idempotency_key: instance.idempotencyKey, created_at: instance.createdAt, updated_at: instance.updatedAt, expires_at: instance.expiresAt };
}

function instanceFromRow(row: Record<string, unknown>): WorkflowInstance {
  return { id: String(row.id), workflowType: String(row.workflow_type), workflowVersion: Number(row.workflow_version), organizationId: String(row.organization_id), userId: row.user_id ? String(row.user_id) : null, triggerType: String(row.trigger_type) as WorkflowInstance['triggerType'], triggerReference: row.trigger_reference ? String(row.trigger_reference) : null, status: String(row.status) as WorkflowInstance['status'], currentStep: row.current_step ? String(row.current_step) : null, input: (row.input || {}) as Record<string, unknown>, state: (row.state || {}) as Record<string, unknown>, requiredFields: Array.isArray(row.required_fields) ? row.required_fields.map(String) : [], approvalId: row.approval_id ? String(row.approval_id) : null, idempotencyKey: String(row.idempotency_key), createdAt: String(row.created_at), updatedAt: String(row.updated_at), expiresAt: String(row.expires_at) };
}

async function rows(response: Response): Promise<Record<string, unknown>[]> {
  if (!response.ok) throw new Error(`JARVIS workflow storage request failed (${response.status}).`);
  return response.json() as Promise<Record<string, unknown>[]>;
}

/** Supabase implementation. It is inactive until the explicit schema flag is enabled. */
export class SupabaseWorkflowRepository implements WorkflowRepository {
  async findByIdempotencyKey(key: string) { const db = database(INSTANCES); const data = await rows(await fetch(`${db.url}?idempotency_key=eq.${encodeURIComponent(key)}&select=*`, { headers: db.headers })); return data[0] ? instanceFromRow(data[0]) : null; }
  async findById(id: string) { const db = database(INSTANCES); const data = await rows(await fetch(`${db.url}?id=eq.${encodeURIComponent(id)}&select=*`, { headers: db.headers })); return data[0] ? instanceFromRow(data[0]) : null; }
  async create(instance: WorkflowInstance) { const db = database(INSTANCES); const data = await rows(await fetch(db.url, { method: 'POST', headers: { ...db.headers, Prefer: 'return=representation' }, body: JSON.stringify(instanceRow(instance)) })); return instanceFromRow(data[0]); }
  async save(instance: WorkflowInstance, expectedStatus: WorkflowInstance['status']) { const db = database(INSTANCES); const data = await rows(await fetch(`${db.url}?id=eq.${encodeURIComponent(instance.id)}&status=eq.${encodeURIComponent(expectedStatus)}`, { method: 'PATCH', headers: { ...db.headers, Prefer: 'return=representation' }, body: JSON.stringify(instanceRow(instance)) })); if (!data[0]) throw new Error('Workflow state changed concurrently; reload before continuing.'); return instanceFromRow(data[0]); }
  async appendStep(step: WorkflowStepHistory) { const db = database(STEPS); const response = await fetch(db.url, { method: 'POST', headers: { ...db.headers, Prefer: 'return=minimal' }, body: JSON.stringify({ id: step.id, workflow_instance_id: step.workflowInstanceId, step: step.step, step_type: step.stepType, attempt: step.attempt, status: step.status, started_at: step.startedAt, completed_at: step.completedAt, result_reference: step.resultReference, error_code: step.errorCode }) }); if (!response.ok) throw new Error(`Unable to save JARVIS workflow step (${response.status}).`); }
  async recordEvent(event: BusinessEvent) { const db = database(EVENTS); const response = await fetch(db.url, { method: 'POST', headers: { ...db.headers, Prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify({ id: event.id, type: event.type, organization_id: event.organizationId, entity_type: event.entityType, entity_id: event.entityId, occurred_at: event.occurredAt, source: event.source, payload: event.payload }) }); const data = await rows(response); return data[0] ? 'accepted' : 'duplicate'; }
}
