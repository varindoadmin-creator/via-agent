import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceWorkflow, isAutomationDue, normalizeBusinessEvent, startWorkflow, workflowStep } from './engine.ts';
import { JarvisWorkflowService } from './service.ts';
import { validateAutomationDefinition } from './automation.ts';
import type { BusinessEvent, WorkflowInstance, WorkflowStepHistory } from './types.ts';
import type { WorkflowRepository } from './repository.ts';

class MemoryRepository implements WorkflowRepository {
  instances = new Map<string, WorkflowInstance>(); events = new Set<string>();
  async findByIdempotencyKey(key: string) { return [...this.instances.values()].find(instance => instance.idempotencyKey === key) || null; }
  async findById(id: string) { return this.instances.get(id) || null; }
  async create(instance: WorkflowInstance) { this.instances.set(instance.id, instance); return instance; }
  async save(instance: WorkflowInstance, expectedStatus: WorkflowInstance['status']) { const current = this.instances.get(instance.id); if (!current || current.status !== expectedStatus) throw new Error('concurrent'); this.instances.set(instance.id, instance); return instance; }
  async appendStep(_step: WorkflowStepHistory) {}
  async recordEvent(event: BusinessEvent) { if (this.events.has(event.id)) return 'duplicate' as const; this.events.add(event.id); return 'accepted' as const; }
}

test('persists a versioned approval wait and resumes safely after restart', () => {
  const workflow = startWorkflow({ workflowType: 'sales_order_preparation', organizationId: 'varindo', userId: 'director', triggerType: 'USER_REQUEST', idempotencyKey: 'request-1', now: new Date('2026-08-29T00:00:00Z') });
  const running = advanceWorkflow(workflow, { status: 'RUNNING' });
  const waiting = advanceWorkflow(running, { status: 'WAITING_FOR_APPROVAL', approvalId: 'approval-1' });
  assert.equal(waiting.workflowVersion, 1); assert.equal(waiting.status, 'WAITING_FOR_APPROVAL');
  assert.equal(advanceWorkflow(waiting, { status: 'RUNNING' }).approvalId, 'approval-1');
});
test('rejects invalid transitions and unsupported event data', () => {
  const workflow = startWorkflow({ workflowType: 'weekly_sales_review', organizationId: 'varindo', triggerType: 'SCHEDULE', idempotencyKey: 'weekly-1' });
  assert.throws(() => advanceWorkflow(workflow, { status: 'COMPLETED' }));
  assert.throws(() => normalizeBusinessEvent({ id: '', type: 'STOCK_LOW', organizationId: 'varindo', entityType: 'item', entityId: '1', occurredAt: 'invalid', source: 'via', payload: {} }));
});
test('keeps protected workflow writes as an approval step', () => {
  const workflow = startWorkflow({ workflowType: 'sales_order_preparation', organizationId: 'varindo', triggerType: 'USER_REQUEST', idempotencyKey: 'so-1' });
  assert.equal(workflowStep(workflow, 'approval', 'APPROVAL').status, 'STARTED');
  assert.throws(() => workflowStep(workflow, 'reasoning', 'JARVIS_REASONING'));
});
test('resolves recurring schedules in the declared timezone', () => {
  assert.equal(isAutomationDue({ kind: 'weekly', hour: 8, minute: 0, weekday: 1 }, 'Asia/Jakarta', new Date('2026-08-31T01:00:00Z')), true);
});
test('durably deduplicates a trigger and keeps approval waits across service restarts', async () => {
  const repository = new MemoryRepository();
  const firstService = new JarvisWorkflowService(repository);
  const first = await firstService.start({ workflowType: 'sales_order_preparation', organizationId: 'varindo', triggerType: 'USER_REQUEST', idempotencyKey: 'user:42:request:7' });
  await firstService.transition(first.id, 'RUNNING');
  const waiting = await firstService.pauseForApproval(first.id, 'approval-42');
  const restartedService = new JarvisWorkflowService(repository);
  const duplicate = await restartedService.start({ workflowType: 'sales_order_preparation', organizationId: 'varindo', triggerType: 'USER_REQUEST', idempotencyKey: 'user:42:request:7' });
  assert.equal(duplicate.id, waiting.id); assert.equal(duplicate.status, 'WAITING_FOR_APPROVAL');
  assert.equal(await restartedService.acceptEvent({ id: 'zoho:invoice:42:paid', type: 'INVOICE_PAID', organizationId: 'varindo', entityType: 'invoice', entityId: '42', occurredAt: '2026-08-29T00:00:00Z', source: 'zoho', payload: {} }), 'accepted');
  assert.equal(await restartedService.acceptEvent({ id: 'zoho:invoice:42:paid', type: 'INVOICE_PAID', organizationId: 'varindo', entityType: 'invoice', entityId: '42', occurredAt: '2026-08-29T00:00:00Z', source: 'zoho', payload: {} }), 'duplicate');
});
test('rejects automation configurations that could make unbounded or write-like actions', () => {
  assert.throws(() => validateAutomationDefinition({ id: 'a', name: 'Bad', workflowType: 'weekly_sales_review', organizationId: 'varindo', createdBy: 'director', runAsRole: 'director', requiredPermissions: [], enabled: true, timezone: 'Asia/Jakarta', schedule: null, autonomyLevel: 4, allowedActions: ['PREPARE'], maxModelCallsPerRun: 26, maxEntitiesPerRun: 600, maxRuntimeMs: 16 * 60_000, concurrencyPolicy: 'SKIP', missedRunPolicy: 'SKIP' }));
});
