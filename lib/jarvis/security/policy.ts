import type { Role } from '../../auth.ts';

type JarvisToolRisk = 'READ' | 'ANALYZE' | 'PREPARE' | 'WRITE' | 'HIGH_RISK';

export type JarvisPermission =
  | 'jarvis.chat' | 'customer.read' | 'products.read' | 'sales.read' | 'inventory.read'
  | 'purchasing.read' | 'finance.read' | 'analytics.analyze' | 'knowledge.read'
  | 'sales_order.prepare' | 'sales_order.create'
  | 'operational_findings.view' | 'operational_findings.manage';

export type JarvisSecurityDecisionCode =
  | 'ALLOWED' | 'AUTH_REQUIRED' | 'PERMISSION_DENIED' | 'CROSS_TENANT_BLOCKED'
  | 'READ_ONLY_MODE' | 'WRITES_DISABLED' | 'HIGH_RISK_DISABLED' | 'RAG_DISABLED'
  | 'TOOL_DISABLED' | 'AMBIGUOUS_TARGET' | 'BULK_LIMIT_EXCEEDED' | 'APPROVAL_REQUIRED';

export interface JarvisSecurityIdentity {
  /** VIA currently has role-based shared sessions; do not treat this as a person identity. */
  userId: string;
  sessionId: string;
  organizationId: string;
  role: Role;
  permissions: readonly JarvisPermission[];
}

export interface JarvisSecurityDecision {
  allowed: boolean;
  code: JarvisSecurityDecisionCode;
  message: string;
}

const DIRECTOR_PERMISSIONS: readonly JarvisPermission[] = [
  'jarvis.chat', 'customer.read', 'products.read', 'sales.read', 'inventory.read',
  'purchasing.read', 'finance.read', 'analytics.analyze', 'knowledge.read',
  'sales_order.prepare', 'sales_order.create',
  'operational_findings.view', 'operational_findings.manage',
];

// Keep the current product posture: administrator accounts can sign in, but no
// JARVIS business tools are granted until their business permission model exists.
const ADMIN_PERMISSIONS: readonly JarvisPermission[] = ['jarvis.chat'];

function enabled(name: string): boolean { return process.env[name] !== 'false'; }
function isTrue(name: string): boolean { return process.env[name] === 'true'; }
function disabledTools(): Set<string> {
  return new Set((process.env.JARVIS_DISABLED_TOOLS || '').split(',').map(value => value.trim()).filter(Boolean));
}

export function createJarvisSecurityIdentity(input: { role: Role; sessionId: string; organizationId?: string }): JarvisSecurityIdentity {
  return {
    userId: `authenticated:${input.role}`,
    sessionId: input.sessionId,
    organizationId: input.organizationId || process.env.VIA_ORGANIZATION_ID || 'varindo',
    role: input.role,
    permissions: input.role === 'director' ? DIRECTOR_PERMISSIONS : ADMIN_PERMISSIONS,
  };
}

const OPERATIONAL_FINDINGS_WRITE_TOOLS = new Set(['acknowledge_finding', 'assign_finding', 'create_action_plan', 'close_finding']);
const OPERATIONAL_FINDINGS_READ_TOOLS = new Set(['get_open_operational_findings', 'get_priority_findings', 'get_finding_detail', 'get_operational_brief']);

export function permissionForTool(input: { category: string; risk: JarvisToolRisk; name: string }): JarvisPermission {
  if (input.name === 'prepare_sales_order') return 'sales_order.prepare';
  if (input.name === 'search_knowledge') return 'knowledge.read';
  if (OPERATIONAL_FINDINGS_WRITE_TOOLS.has(input.name)) return 'operational_findings.manage';
  if (OPERATIONAL_FINDINGS_READ_TOOLS.has(input.name)) return 'operational_findings.view';
  if (input.risk === 'ANALYZE') return 'analytics.analyze';
  const category = input.category === 'products' ? 'products' : input.category;
  return `${category}.read` as JarvisPermission;
}

export function authorizeJarvisAction(input: {
  identity?: JarvisSecurityIdentity;
  tool: { name: string; category: string; risk: JarvisToolRisk; permissions: readonly JarvisPermission[]; requiresApproval?: boolean };
  resourceOrganizationId?: string;
  targetAmbiguous?: boolean;
  bulkCount?: number;
  approvalProvided?: boolean;
}): JarvisSecurityDecision {
  if (!input.identity) return { allowed: false, code: 'AUTH_REQUIRED', message: 'A valid JARVIS session is required.' };
  const identity = input.identity;
  if (input.resourceOrganizationId && input.resourceOrganizationId !== identity.organizationId) {
    return { allowed: false, code: 'CROSS_TENANT_BLOCKED', message: 'This request is outside your organization boundary.' };
  }
  if (input.tool.permissions.some(permission => !identity.permissions.includes(permission))) {
    return { allowed: false, code: 'PERMISSION_DENIED', message: 'You do not have permission to use this VIA capability.' };
  }
  if (disabledTools().has(input.tool.name)) return { allowed: false, code: 'TOOL_DISABLED', message: 'This JARVIS capability is temporarily disabled.' };
  if (input.tool.name === 'search_knowledge' && !enabled('JARVIS_RAG_ENABLED')) return { allowed: false, code: 'RAG_DISABLED', message: 'Knowledge retrieval is temporarily disabled.' };
  if ((input.tool.risk === 'WRITE' || input.tool.risk === 'HIGH_RISK') && isTrue('JARVIS_READ_ONLY')) return { allowed: false, code: 'READ_ONLY_MODE', message: 'JARVIS is in read-only mode; no business record can be changed.' };
  if (input.tool.risk === 'WRITE' && !enabled('JARVIS_WRITES_ENABLED')) return { allowed: false, code: 'WRITES_DISABLED', message: 'JARVIS writes are temporarily disabled.' };
  if (input.tool.risk === 'HIGH_RISK' && !enabled('JARVIS_HIGH_RISK_ENABLED')) return { allowed: false, code: 'HIGH_RISK_DISABLED', message: 'High-risk JARVIS actions are temporarily disabled.' };
  if (input.targetAmbiguous && input.tool.risk !== 'READ') return { allowed: false, code: 'AMBIGUOUS_TARGET', message: 'JARVIS needs an exact target before it can prepare or change anything.' };
  const maxBulk = Math.max(1, Math.min(500, Number(process.env.JARVIS_BULK_LIMIT) || 100));
  if ((input.bulkCount || 0) > maxBulk) return { allowed: false, code: 'BULK_LIMIT_EXCEEDED', message: `This action exceeds the safe batch limit of ${maxBulk}.` };
  if (input.tool.requiresApproval && !input.approvalProvided) return { allowed: false, code: 'APPROVAL_REQUIRED', message: 'This action requires an explicit, current approval.' };
  return { allowed: true, code: 'ALLOWED', message: 'Authorized by JARVIS policy.' };
}
