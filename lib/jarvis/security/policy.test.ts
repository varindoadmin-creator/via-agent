import assert from 'node:assert/strict';
import test from 'node:test';
import { authorizeJarvisAction, createJarvisSecurityIdentity, permissionForTool } from './policy.ts';

const director = createJarvisSecurityIdentity({ role: 'director', sessionId: 'test-session', organizationId: 'varindo' });
const readTool = { name: 'search_customer', category: 'customer', risk: 'READ' as const, permissions: ['customer.read'] as const };

test('blocks a cross-organization resource before tool execution', () => {
  const result = authorizeJarvisAction({ identity: director, tool: readTool, resourceOrganizationId: 'another-company' });
  assert.equal(result.code, 'CROSS_TENANT_BLOCKED');
  assert.equal(result.allowed, false);
});

test('keeps administrator business tools default-denied', () => {
  const admin = createJarvisSecurityIdentity({ role: 'admin', sessionId: 'test-session', organizationId: 'varindo' });
  const result = authorizeJarvisAction({ identity: admin, tool: readTool });
  assert.equal(result.code, 'PERMISSION_DENIED');
});

test('requires approval for an exact write action', () => {
  const write = { name: 'create_sales_order', category: 'sales', risk: 'WRITE' as const, permissions: ['sales_order.create'] as const, requiresApproval: true };
  assert.equal(authorizeJarvisAction({ identity: director, tool: write }).code, 'APPROVAL_REQUIRED');
  assert.equal(authorizeJarvisAction({ identity: director, tool: write, approvalProvided: true }).code, 'ALLOWED');
});

test('blocks ambiguous and oversized protected actions', () => {
  const prepare = { name: 'prepare_sales_order', category: 'sales', risk: 'PREPARE' as const, permissions: ['sales_order.prepare'] as const };
  assert.equal(authorizeJarvisAction({ identity: director, tool: prepare, targetAmbiguous: true }).code, 'AMBIGUOUS_TARGET');
  assert.equal(authorizeJarvisAction({ identity: director, tool: prepare, bulkCount: 101 }).code, 'BULK_LIMIT_EXCEEDED');
});

test('read-only mode blocks write actions even when approval is supplied', () => {
  const previous = process.env.JARVIS_READ_ONLY;
  process.env.JARVIS_READ_ONLY = 'true';
  try {
    const write = { name: 'create_sales_order', category: 'sales', risk: 'WRITE' as const, permissions: ['sales_order.create'] as const, requiresApproval: true };
    assert.equal(authorizeJarvisAction({ identity: director, tool: write, approvalProvided: true }).code, 'READ_ONLY_MODE');
  } finally {
    if (previous === undefined) delete process.env.JARVIS_READ_ONLY;
    else process.env.JARVIS_READ_ONLY = previous;
  }
});

test('disabled tool switch prevents execution server-side', () => {
  const previous = process.env.JARVIS_DISABLED_TOOLS;
  process.env.JARVIS_DISABLED_TOOLS = 'search_customer';
  try {
    assert.equal(authorizeJarvisAction({ identity: director, tool: readTool }).code, 'TOOL_DISABLED');
  } finally {
    if (previous === undefined) delete process.env.JARVIS_DISABLED_TOOLS;
    else process.env.JARVIS_DISABLED_TOOLS = previous;
  }
});

// VIA Customer Operations Phase 10, brief section 109/137: internal permission model.
test('Test 137 — an administrator (no operational_findings permissions) cannot use the operational-findings tools', () => {
  const admin = createJarvisSecurityIdentity({ role: 'admin', sessionId: 'test-session', organizationId: 'varindo' });
  const findingsRead = { name: 'get_open_operational_findings', category: 'analytics', risk: 'READ' as const, permissions: [permissionForTool({ name: 'get_open_operational_findings', category: 'analytics', risk: 'READ' })] };
  const findingsWrite = { name: 'acknowledge_finding', category: 'analytics', risk: 'WRITE' as const, permissions: [permissionForTool({ name: 'acknowledge_finding', category: 'analytics', risk: 'WRITE' })] };
  assert.equal(authorizeJarvisAction({ identity: admin, tool: findingsRead }).code, 'PERMISSION_DENIED');
  assert.equal(authorizeJarvisAction({ identity: admin, tool: findingsWrite }).code, 'PERMISSION_DENIED');
});

test('a director has both operational_findings.view and operational_findings.manage', () => {
  assert.equal(permissionForTool({ name: 'get_priority_findings', category: 'analytics', risk: 'READ' }), 'operational_findings.view');
  assert.equal(permissionForTool({ name: 'close_finding', category: 'analytics', risk: 'WRITE' }), 'operational_findings.manage');
  const findingsRead = { name: 'get_priority_findings', category: 'analytics', risk: 'READ' as const, permissions: ['operational_findings.view' as const] };
  assert.equal(authorizeJarvisAction({ identity: director, tool: findingsRead }).code, 'ALLOWED');
});

// Brief section 113/136: WATI Jarvis must receive none of the Phase 10 management tools.
// The structural guarantee is architectural (lib/integrations/wati/pipeline.ts never
// imports lib/jarvis/tools/registry.ts or lib/operationalIntelligence/findingStore.ts
// at all — the same guarantee Phase 9's analytics tools already rely on) — this test
// verifies that guarantee still holds by scanning the pipeline's own source text.
test('Test 136 — the WATI pipeline never imports the internal Jarvis tool registry or the operational-findings store', async () => {
  const fs = await import('node:fs/promises');
  const pipelineSource = await fs.readFile(new URL('../../integrations/wati/pipeline.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(pipelineSource, /jarvis\/tools\/registry/);
  assert.doesNotMatch(pipelineSource, /operationalIntelligence\/(findingStore|detectionEngine)/);
});
