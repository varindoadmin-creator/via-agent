// ─── Operational Intelligence Jarvis tools ────────────────────────────────────
// VIA Customer Operations Phase 10, brief section 112: internal-only tools
// over the Phase 10 finding store. Registered ONLY in the internal tool
// registry (lib/jarvis/tools/registry.ts), which the WATI pipeline never
// imports — unreachable from any external/WATI audience by construction,
// the same guarantee Phase 9's analytics tools rely on (brief section
// 108/113/136). Every write here calls findingStore.ts directly (already
// versioned/audited) — the LLM never decides severity or whether a finding
// exists (brief section 114); it only reads/narrates/transitions.

import { tool } from '@openai/agents';
import { z } from 'zod';
import type { JarvisRunContext } from '@/lib/jarvis/context';
import { listFindings, getFinding, acknowledgeFinding, assignFinding, resolveFinding, dismissFinding, createActionPlan } from '@/lib/operationalIntelligence/findingStore';
import { rankOpenFindings } from '@/lib/operationalIntelligence/priorityService';
import { getOperationalBrief } from '@/lib/operationalIntelligence/brief';
import { getFindingOutcome } from '@/lib/operationalIntelligence/outcome';

const teamEnum = z.enum(['CUSTOMER_SERVICE', 'SALES', 'FINANCE', 'OPERATIONS', 'MANAGEMENT']);
const roleEnum = z.enum(['admin', 'director']);
const dismissalReasonEnum = z.enum(['KNOWN_ISSUE', 'NOT_MATERIAL', 'FALSE_POSITIVE', 'EXPECTED_BUSINESS_PATTERN', 'ALREADY_ADDRESSED', 'OTHER']);

const categoryFilterParams = z.object({ category: z.string().nullable() });
const emptyParams = z.object({});
const findingIdOnlyParams = z.object({ findingId: z.string() });
const findingIdParams = z.object({ findingId: z.string(), expectedVersion: z.number() });
const assignFindingParams = z.object({ findingId: z.string(), expectedVersion: z.number(), assignedRole: roleEnum.nullable(), assignedTeam: teamEnum.nullable() });
const createActionPlanParams = z.object({ findingId: z.string(), expectedVersion: z.number(), description: z.string(), ownerTeam: teamEnum.nullable(), dueAt: z.string().nullable() });
const closeFindingParams = z.object({ findingId: z.string(), expectedVersion: z.number(), action: z.enum(['RESOLVE', 'DISMISS']), dismissalReason: dismissalReasonEnum.nullable() });

export const getOpenOperationalFindingsTool = tool<typeof categoryFilterParams, JarvisRunContext>({
  name: 'get_open_operational_findings',
  description: 'List currently open operational findings (issues and opportunities Jarvis has already detected deterministically), optionally filtered by category.',
  parameters: categoryFilterParams,
  async execute({ category }) {
    const findings = await listFindings(category ? { category: category as never } : {});
    return { kind: 'open_operational_findings', count: findings.length, findings };
  },
});

export const getPriorityFindingsTool = tool<typeof emptyParams, JarvisRunContext>({
  name: 'get_priority_findings',
  description: 'Get open operational findings ranked by a transparent priority score (severity, urgency, confidence, affected count, commercial impact, age) — never ranked by revenue alone.',
  parameters: emptyParams,
  async execute() {
    const ranked = await rankOpenFindings();
    return { kind: 'priority_findings', findings: ranked.map(r => ({ finding: r.finding, score: r.score, factors: r.factors })) };
  },
});

export const getFindingDetailTool = tool<typeof findingIdOnlyParams, JarvisRunContext>({
  name: 'get_finding_detail',
  description: 'Get the full detail and structured evidence for one operational finding, including its post-action outcome if it has been resolved.',
  parameters: findingIdOnlyParams,
  async execute({ findingId }) {
    const finding = await getFinding(findingId);
    if (!finding) return { kind: 'finding_detail', error: 'Finding not found.' };
    const outcome = await getFindingOutcome(findingId);
    return { kind: 'finding_detail', finding, outcome };
  },
});

export const getOperationalBriefTool = tool<typeof emptyParams, JarvisRunContext>({
  name: 'get_operational_brief',
  description: 'Get "Today\'s Operational Brief" — the top 3-5 findings management should focus on, plus one commercial opportunity highlight. Never returns every open finding; use get_open_operational_findings for the full list.',
  parameters: emptyParams,
  async execute() {
    return { kind: 'operational_brief', ...(await getOperationalBrief()) };
  },
});

export const acknowledgeFindingTool = tool<typeof findingIdParams, JarvisRunContext>({
  name: 'acknowledge_finding',
  description: 'Acknowledge an open operational finding on behalf of the current internal user.',
  parameters: findingIdParams,
  async execute({ findingId, expectedVersion }, context) {
    if (!context?.context) throw new Error('JARVIS run context is unavailable.');
    const finding = await acknowledgeFinding(findingId, context.context.role, expectedVersion);
    return { kind: 'finding_updated', finding };
  },
});

export const assignFindingTool = tool<typeof assignFindingParams, JarvisRunContext>({
  name: 'assign_finding',
  description: 'Assign an operational finding to a role and/or team.',
  parameters: assignFindingParams,
  async execute({ findingId, expectedVersion, assignedRole, assignedTeam }, context) {
    if (!context?.context) throw new Error('JARVIS run context is unavailable.');
    const finding = await assignFinding(findingId, context.context.role, expectedVersion, { assignedRole: assignedRole ?? undefined, assignedTeam: assignedTeam ?? undefined });
    return { kind: 'finding_updated', finding };
  },
});

export const createActionPlanTool = tool<typeof createActionPlanParams, JarvisRunContext>({
  name: 'create_action_plan',
  description: 'Create a lightweight action-plan item for an operational finding — never a high-impact business action (no purchases, price changes, discounts, or customer messages).',
  parameters: createActionPlanParams,
  async execute({ findingId, expectedVersion, description, ownerTeam, dueAt }, context) {
    if (!context?.context) throw new Error('JARVIS run context is unavailable.');
    const result = await createActionPlan(findingId, context.context.role, expectedVersion, { description, ownerRole: context.context.role, ownerTeam: ownerTeam ?? undefined, dueAt: dueAt ?? undefined });
    return { kind: 'action_plan_created', action: result.action, finding: result.finding };
  },
});

export const closeFindingTool = tool<typeof closeFindingParams, JarvisRunContext>({
  name: 'close_finding',
  description: 'Resolve or dismiss an operational finding. Dismissing accepts an optional reason (helps tune detection rules over time).',
  parameters: closeFindingParams,
  async execute({ findingId, expectedVersion, action, dismissalReason }, context) {
    if (!context?.context) throw new Error('JARVIS run context is unavailable.');
    const finding = action === 'RESOLVE'
      ? await resolveFinding(findingId, context.context.role, expectedVersion)
      : await dismissFinding(findingId, context.context.role, expectedVersion, dismissalReason ?? 'OTHER');
    return { kind: 'finding_updated', finding };
  },
});
