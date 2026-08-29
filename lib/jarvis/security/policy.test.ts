import assert from 'node:assert/strict';
import test from 'node:test';
import { authorizeJarvisAction, createJarvisSecurityIdentity } from './policy.ts';

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
