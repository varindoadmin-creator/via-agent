import { advanceWorkflow, normalizeBusinessEvent, startWorkflow, workflowStep } from './engine.ts';
import type { BusinessEvent, WorkflowInstance, WorkflowStatus, WorkflowStepHistory, WorkflowStepType, WorkflowTriggerType } from './types.ts';
import type { WorkflowRepository } from './repository.ts';

/** Durable orchestration boundary: model output never owns workflow status. */
export class JarvisWorkflowService {
  private readonly repository: WorkflowRepository;
  constructor(repository: WorkflowRepository) { this.repository = repository; }
  async start(input: Parameters<typeof startWorkflow>[0]) {
    const existing = await this.repository.findByIdempotencyKey(input.idempotencyKey);
    return existing || this.repository.create(startWorkflow(input));
  }
  async transition(id: string, status: WorkflowStatus, changes: Omit<Parameters<typeof advanceWorkflow>[1], 'status'> = {}) {
    const current = await this.repository.findById(id);
    if (!current) throw new Error('Workflow instance was not found.');
    const next = advanceWorkflow(current, { ...changes, status });
    return this.repository.save(next, current.status);
  }
  pauseForApproval(id: string, approvalId: string) { return this.transition(id, 'WAITING_FOR_APPROVAL', { approvalId }); }
  pauseForUser(id: string, requiredFields: string[]) { return this.transition(id, 'WAITING_FOR_USER', { requiredFields }); }
  resume(id: string) { return this.transition(id, 'RUNNING'); }
  complete(id: string) { return this.transition(id, 'COMPLETED'); }
  fail(id: string, errorCode: string) { return this.transition(id, 'FAILED', { state: { errorCode } }); }
  cancel(id: string) { return this.transition(id, 'CANCELLED'); }
  async recordStep(instance: WorkflowInstance, step: string, stepType: WorkflowStepType, attempt = 1): Promise<WorkflowStepHistory> { const history = workflowStep(instance, step, stepType, attempt); await this.repository.appendStep(history); return history; }
  async acceptEvent(event: BusinessEvent) { return this.repository.recordEvent(normalizeBusinessEvent(event)); }
}
