// ─── Proactive Customer & Sales Automation Jarvis tools ───────────────────────
// VIA Customer Operations Phase 11: internal-only tools over the proactive
// action store. Registered ONLY in the internal tool registry (lib/jarvis/
// tools/registry.ts), which the WATI pipeline never imports — unreachable
// from any external/WATI audience by construction, the same guarantee
// Phase 9/10's internal tools rely on. Jarvis never decides eligibility,
// approval level, or message wording facts here — it only reads/narrates/
// transitions rows the deterministic engine already produced.

import { tool } from '@openai/agents';
import { z } from 'zod';
import type { JarvisRunContext } from '@/lib/jarvis/context';
import { listActions, getAction, approveAction, assignAction, dismissAction, cancelAction } from '@/lib/proactiveActions/store';
import { createCustomerCallback } from '@/lib/proactiveActions/callback';

const teamEnum = z.enum(['CUSTOMER_SERVICE', 'SALES', 'FINANCE', 'OPERATIONS', 'MANAGEMENT']);
const roleEnum = z.enum(['admin', 'director']);
const statusEnum = z.enum(['DETECTED', 'REVIEW_REQUIRED', 'APPROVED', 'SCHEDULED', 'SENT', 'CUSTOMER_RESPONDED', 'CONVERTED', 'DISMISSED', 'EXPIRED', 'FAILED', 'CANCELLED']);
const typeEnum = z.enum(['QUOTATION_FOLLOW_UP', 'ORDER_INTENT_FOLLOW_UP', 'REORDER_OPPORTUNITY', 'SAMPLE_REQUEST_FOLLOW_UP', 'CUSTOMER_CALLBACK', 'NEEDS_INFORMATION_FOLLOW_UP', 'INACTIVE_COMMERCIAL_DRAFT', 'SERVICE_RECOVERY', 'APPROVED_CAMPAIGN_OUTREACH', 'DORMANT_CUSTOMER_REENGAGEMENT']);
const dismissalReasonEnum = z.enum(['ALREADY_HANDLED', 'CUSTOMER_DECLINED', 'NOT_RELEVANT', 'DUPLICATE', 'POLICY_BLOCKED', 'OTHER']);

const listParams = z.object({ type: typeEnum.nullable(), status: statusEnum.nullable(), assignedTeam: teamEnum.nullable() });
const actionIdOnlyParams = z.object({ actionId: z.string() });
const actionIdParams = z.object({ actionId: z.string(), expectedVersion: z.number() });
const assignParams = z.object({ actionId: z.string(), expectedVersion: z.number(), assignedRole: roleEnum.nullable(), assignedTeam: teamEnum.nullable() });
const dismissParams = z.object({ actionId: z.string(), expectedVersion: z.number(), reason: dismissalReasonEnum });
const callbackParams = z.object({
  customerPhoneNormalized: z.string(), conversationId: z.string().nullable(), customerId: z.string().nullable(),
  requestedTime: z.string().nullable(), context: z.string(),
});

export const getProactiveOpportunitiesTool = tool<typeof listParams, JarvisRunContext>({
  name: 'get_proactive_opportunities',
  description: 'List currently open proactive customer/sales follow-up opportunities (quotation follow-ups, reorder opportunities, sample follow-ups, callbacks, etc.), optionally filtered by type, status, or assigned team.',
  parameters: listParams,
  async execute({ type, status, assignedTeam }) {
    const actions = await listActions({
      type: type ?? undefined, assignedTeam: assignedTeam ?? undefined,
      status: status ? [status] : undefined,
    });
    return { kind: 'proactive_opportunities', count: actions.length, actions };
  },
});

export const getProactiveActionDetailTool = tool<typeof actionIdOnlyParams, JarvisRunContext>({
  name: 'get_proactive_action_detail',
  description: 'Get the full detail and evidence for one proactive customer/sales action.',
  parameters: actionIdOnlyParams,
  async execute({ actionId }) {
    const action = await getAction(actionId);
    if (!action) return { kind: 'proactive_action_detail', error: 'Action not found.' };
    return { kind: 'proactive_action_detail', action };
  },
});

export const approveProactiveActionTool = tool<typeof actionIdParams, JarvisRunContext>({
  name: 'approve_proactive_action',
  description: 'Approve a proactive customer outreach action that requires review. The actual send still re-validates eligibility and facts immediately before sending — approval only authorizes it.',
  parameters: actionIdParams,
  async execute({ actionId, expectedVersion }, context) {
    if (!context?.context) throw new Error('JARVIS run context is unavailable.');
    const action = await approveAction(actionId, context.context.role, expectedVersion);
    return { kind: 'proactive_action_updated', action };
  },
});

export const assignProactiveActionTool = tool<typeof assignParams, JarvisRunContext>({
  name: 'assign_proactive_action',
  description: 'Assign a proactive action to a role and/or team.',
  parameters: assignParams,
  async execute({ actionId, expectedVersion, assignedRole, assignedTeam }, context) {
    if (!context?.context) throw new Error('JARVIS run context is unavailable.');
    const action = await assignAction(actionId, context.context.role, expectedVersion, { assignedRole: assignedRole ?? undefined, assignedTeam: assignedTeam ?? undefined });
    return { kind: 'proactive_action_updated', action };
  },
});

export const dismissProactiveActionTool = tool<typeof dismissParams, JarvisRunContext>({
  name: 'dismiss_proactive_action',
  description: 'Dismiss a proactive action with a reason (helps tune detection over time). This permanently stops that specific follow-up — it will not be recreated by a later sweep.',
  parameters: dismissParams,
  async execute({ actionId, expectedVersion, reason }, context) {
    if (!context?.context) throw new Error('JARVIS run context is unavailable.');
    const action = await dismissAction(actionId, context.context.role, expectedVersion, reason);
    return { kind: 'proactive_action_updated', action };
  },
});

export const cancelProactiveActionTool = tool<typeof actionIdParams, JarvisRunContext>({
  name: 'cancel_proactive_action',
  description: 'Cancel a proactive action that is scheduled/approved but should not proceed (e.g. the customer already resolved this a different way).',
  parameters: actionIdParams,
  async execute({ actionId, expectedVersion }, context) {
    if (!context?.context) throw new Error('JARVIS run context is unavailable.');
    const action = await cancelAction(actionId, context.context.role, expectedVersion);
    return { kind: 'proactive_action_updated', action };
  },
});

export const recordCustomerCallbackTool = tool<typeof callbackParams, JarvisRunContext>({
  name: 'record_customer_callback',
  description: 'Record an explicit customer callback request as an internal task for Sales/Customer Service. Never claims the call already happened.',
  parameters: callbackParams,
  async execute({ customerPhoneNormalized, conversationId, customerId, requestedTime, context: requestContext }) {
    const result = await createCustomerCallback({
      customerPhoneNormalized, conversationId: conversationId ?? undefined, customerId: customerId ?? undefined,
      requestedTime: requestedTime ?? undefined, context: requestContext,
    });
    return { kind: 'customer_callback_recorded', action: result.action };
  },
});
