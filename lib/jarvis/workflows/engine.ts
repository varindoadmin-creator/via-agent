import { randomUUID } from 'node:crypto';
import { getWorkflowDefinition } from './definitions.ts';
import type { BusinessEvent, WorkflowInstance, WorkflowStatus, WorkflowStepHistory, WorkflowStepType, WorkflowTriggerType } from './types.ts';

const TRANSITIONS: Record<WorkflowStatus, WorkflowStatus[]> = {
  PENDING: ['RUNNING', 'CANCELLED', 'EXPIRED'], RUNNING: ['WAITING_FOR_USER', 'WAITING_FOR_APPROVAL', 'WAITING_FOR_DEPENDENCY', 'RETRY_SCHEDULED', 'COMPLETED', 'FAILED', 'CANCELLED'],
  WAITING_FOR_USER: ['RUNNING', 'CANCELLED', 'EXPIRED'], WAITING_FOR_APPROVAL: ['RUNNING', 'CANCELLED', 'EXPIRED'], WAITING_FOR_DEPENDENCY: ['RUNNING', 'RETRY_SCHEDULED', 'FAILED', 'CANCELLED'], RETRY_SCHEDULED: ['RUNNING', 'FAILED', 'CANCELLED', 'EXPIRED'],
  COMPLETED: [], FAILED: [], CANCELLED: [], EXPIRED: [],
};

export function canTransitionWorkflow(from: WorkflowStatus, to: WorkflowStatus): boolean { return TRANSITIONS[from].includes(to); }

export function startWorkflow(input: { workflowType: string; organizationId: string; userId?: string | null; triggerType: WorkflowTriggerType; triggerReference?: string; idempotencyKey: string; input?: Record<string, unknown>; now?: Date }): WorkflowInstance {
  const definition = getWorkflowDefinition(input.workflowType);
  if (!definition.triggerTypes.includes(input.triggerType)) throw new Error(`Workflow ${definition.id} cannot start from ${input.triggerType}.`);
  const now = input.now || new Date();
  return { id: randomUUID(), workflowType: definition.id, workflowVersion: definition.version, organizationId: input.organizationId, userId: input.userId || null, triggerType: input.triggerType, triggerReference: input.triggerReference || null, status: 'PENDING', currentStep: null, input: input.input || {}, state: {}, requiredFields: [], approvalId: null, idempotencyKey: input.idempotencyKey, createdAt: now.toISOString(), updatedAt: now.toISOString(), expiresAt: new Date(now.getTime() + definition.timeoutMs).toISOString() };
}

export function advanceWorkflow(instance: WorkflowInstance, input: { status: WorkflowStatus; currentStep?: string | null; state?: Record<string, unknown>; requiredFields?: string[]; approvalId?: string | null; now?: Date }): WorkflowInstance {
  if (!canTransitionWorkflow(instance.status, input.status)) throw new Error(`Invalid workflow transition ${instance.status} -> ${input.status}.`);
  return { ...instance, status: input.status, currentStep: input.currentStep ?? instance.currentStep, state: input.state ? { ...instance.state, ...input.state } : instance.state, requiredFields: input.requiredFields ?? instance.requiredFields, approvalId: input.approvalId ?? instance.approvalId, updatedAt: (input.now || new Date()).toISOString() };
}

export function workflowStep(instance: WorkflowInstance, step: string, stepType: WorkflowStepType, attempt = 1, now = new Date()): WorkflowStepHistory {
  const definition = getWorkflowDefinition(instance.workflowType);
  if (!definition.allowedStepTypes.includes(stepType)) throw new Error(`${stepType} is not allowed in ${instance.workflowType}.`);
  return { id: randomUUID(), workflowInstanceId: instance.id, step, stepType, attempt, status: 'STARTED', startedAt: now.toISOString(), completedAt: null, resultReference: null, errorCode: null };
}

export function normalizeBusinessEvent(input: BusinessEvent): BusinessEvent {
  if (!input.id || !input.type || !input.organizationId || !input.entityType || !input.entityId || !input.source) throw new Error('Business events require a stable identity, scope, entity, and source.');
  if (Number.isNaN(Date.parse(input.occurredAt))) throw new Error('Business event has an invalid occurredAt timestamp.');
  return { ...input, payload: input.payload || {} };
}

/** All schedules resolve in their declared IANA timezone; a scheduler may call this once per minute. */
export function isAutomationDue(schedule: { kind: 'daily' | 'weekly'; hour: number; minute: number; weekday?: number }, timezone: string, now = new Date()): boolean {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const get = (type: string) => Number(parts.find(part => part.type === type)?.value);
  const day = parts.find(part => part.type === 'weekday')?.value;
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(day || '');
  return get('hour') === schedule.hour && get('minute') === schedule.minute && (schedule.kind === 'daily' || schedule.weekday === weekday);
}
