export type WorkflowTriggerType = 'USER_REQUEST' | 'SCHEDULE' | 'BUSINESS_EVENT' | 'MANUAL_ADMIN';
export type WorkflowStatus = 'PENDING' | 'RUNNING' | 'WAITING_FOR_USER' | 'WAITING_FOR_APPROVAL' | 'WAITING_FOR_DEPENDENCY' | 'RETRY_SCHEDULED' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'EXPIRED';
export type WorkflowStepType = 'DETERMINISTIC' | 'TOOL' | 'JARVIS_REASONING' | 'APPROVAL' | 'WAIT' | 'NOTIFICATION' | 'CONDITION';
export type AutomationAutonomyLevel = 0 | 1 | 2 | 3 | 4;

export interface WorkflowDefinition {
  id: string;
  version: number;
  triggerTypes: WorkflowTriggerType[];
  allowedStepTypes: WorkflowStepType[];
  requiredPermissions: string[];
  maxSteps: number;
  timeoutMs: number;
  protectedWrite: boolean;
}

export interface WorkflowInstance {
  id: string;
  workflowType: string;
  workflowVersion: number;
  organizationId: string;
  userId: string | null;
  triggerType: WorkflowTriggerType;
  triggerReference: string | null;
  status: WorkflowStatus;
  currentStep: string | null;
  input: Record<string, unknown>;
  state: Record<string, unknown>;
  requiredFields: string[];
  approvalId: string | null;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export interface WorkflowStepHistory {
  id: string;
  workflowInstanceId: string;
  step: string;
  stepType: WorkflowStepType;
  attempt: number;
  status: 'STARTED' | 'COMPLETED' | 'FAILED' | 'SKIPPED';
  startedAt: string;
  completedAt: string | null;
  resultReference: string | null;
  errorCode: string | null;
}

export interface BusinessEvent {
  id: string;
  type: string;
  organizationId: string;
  entityType: string;
  entityId: string;
  occurredAt: string;
  source: string;
  payload: Record<string, unknown>;
}

export interface AutomationDefinition {
  id: string;
  name: string;
  workflowType: string;
  organizationId: string;
  createdBy: string;
  runAsRole: string;
  requiredPermissions: string[];
  enabled: boolean;
  timezone: string;
  schedule: { kind: 'daily' | 'weekly'; hour: number; minute: number; weekday?: number } | null;
  autonomyLevel: AutomationAutonomyLevel;
  allowedActions: Array<'READ' | 'ANALYZE' | 'NOTIFY' | 'PREPARE'>;
  maxModelCallsPerRun: number;
  maxEntitiesPerRun: number;
  maxRuntimeMs: number;
  concurrencyPolicy: 'SKIP' | 'QUEUE';
  missedRunPolicy: 'SKIP' | 'LATEST_ONLY' | 'RUN_ON_RECOVERY';
}
