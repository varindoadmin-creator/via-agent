import type { WorkflowDefinition } from './types.ts';

/** Inspectable v1 definitions. Protected writes remain in the existing approval service. */
export const JARVIS_WORKFLOW_DEFINITIONS: Record<string, WorkflowDefinition> = {
  sales_order_preparation: { id: 'sales_order_preparation', version: 1, triggerTypes: ['USER_REQUEST'], allowedStepTypes: ['DETERMINISTIC', 'TOOL', 'APPROVAL'], requiredPermissions: ['sales_order.create'], maxSteps: 8, timeoutMs: 30 * 60_000, protectedWrite: true },
  weekly_sales_review: { id: 'weekly_sales_review', version: 1, triggerTypes: ['SCHEDULE', 'MANUAL_ADMIN'], allowedStepTypes: ['DETERMINISTIC', 'TOOL', 'JARVIS_REASONING', 'NOTIFICATION'], requiredPermissions: [], maxSteps: 6, timeoutMs: 10 * 60_000, protectedWrite: false },
  low_stock_review: { id: 'low_stock_review', version: 1, triggerTypes: ['SCHEDULE', 'BUSINESS_EVENT', 'MANUAL_ADMIN'], allowedStepTypes: ['DETERMINISTIC', 'TOOL', 'JARVIS_REASONING', 'NOTIFICATION'], requiredPermissions: [], maxSteps: 6, timeoutMs: 10 * 60_000, protectedWrite: false },
  overdue_receivable_review: { id: 'overdue_receivable_review', version: 1, triggerTypes: ['SCHEDULE', 'MANUAL_ADMIN'], allowedStepTypes: ['DETERMINISTIC', 'TOOL', 'JARVIS_REASONING', 'NOTIFICATION'], requiredPermissions: [], maxSteps: 6, timeoutMs: 10 * 60_000, protectedWrite: false },
};

export function getWorkflowDefinition(id: string): WorkflowDefinition {
  const definition = JARVIS_WORKFLOW_DEFINITIONS[id];
  if (!definition || process.env[`JARVIS_WORKFLOW_${id.toUpperCase()}_ENABLED`] === 'false') throw new Error(`Workflow ${id} is unavailable.`);
  return definition;
}
