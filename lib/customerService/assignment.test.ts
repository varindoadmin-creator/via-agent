import assert from 'node:assert/strict';
import test from 'node:test';
import { assignToRole, assignToTeam, leastOpenCasesRole } from './assignment.ts';

function setEnv() {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
}

function existingCase(overrides: Record<string, unknown> = {}) {
  return {
    customer_phone_normalized: '234567890', state: 'NEEDS_HUMAN', priority: 'NORMAL',
    assigned_role: null, assigned_team: 'CUSTOMER_SERVICE', handoff_reason: 'CUSTOMER_REQUESTED_HUMAN',
    handoff_created_at: '2026-01-01T00:00:00.000Z', human_assigned_at: null, human_first_response_at: null,
    resolved_at: null, closed_at: null, active_customer_id: null, version: 2,
    ...overrides,
  };
}

test('Test 11 — assigning to a role moves NEEDS_HUMAN to HUMAN_ASSIGNED', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  let patchBody: Record<string, unknown> | null = null;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    if (!init?.method || init.method === 'GET') return new Response(JSON.stringify([existingCase()]), { status: 200 });
    if (!String(url).includes('wati_conversation_state')) return new Response('', { status: 201 });
    patchBody = JSON.parse(String(init.body));
    return new Response(JSON.stringify([{ ...existingCase(), ...patchBody }]), { status: 200 });
  }) as typeof fetch;
  try {
    const result = await assignToRole('234567890', 'admin', 'director');
    assert.equal(result.state, 'HUMAN_ASSIGNED');
    assert.equal(result.assigned_role, 'admin');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Section 56/57 — reassigning to a different team is logged as a team_transfer with from/to team metadata', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  let auditBody: Record<string, unknown> | null = null;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    if (!init?.method || init.method === 'GET') return new Response(JSON.stringify([existingCase({ assigned_team: 'SALES' })]), { status: 200 });
    if (String(url).includes('customer_service_audit_log')) { auditBody = JSON.parse(String(init.body)); return new Response('', { status: 201 }); }
    const patchBody = JSON.parse(String(init.body));
    return new Response(JSON.stringify([{ ...existingCase(), ...patchBody }]), { status: 200 });
  }) as typeof fetch;
  try {
    await assignToTeam('234567890', 'FINANCE', 'admin');
    assert.equal(auditBody!.event_type, 'service.team_transfer');
    assert.equal((auditBody!.metadata as Record<string, unknown>).fromTeam, 'SALES');
    assert.equal((auditBody!.metadata as Record<string, unknown>).toTeam, 'FINANCE');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Section 12 — leastOpenCasesRole picks whichever shared role has fewer open cases, no ML', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    const u = String(url);
    if (u.includes('assigned_role=eq.admin')) return new Response(JSON.stringify([{ customer_phone_normalized: 'a' }, { customer_phone_normalized: 'b' }]), { status: 200 });
    if (u.includes('assigned_role=eq.director')) return new Response('[]', { status: 200 });
    return new Response('[]', { status: 200 });
  }) as typeof fetch;
  try {
    const role = await leastOpenCasesRole();
    assert.equal(role, 'director');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
