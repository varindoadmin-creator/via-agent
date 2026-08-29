import { randomUUID } from 'node:crypto';
import type { JarvisMemory, JarvisMemoryCandidate, JarvisMemoryScope } from './types.ts';

const TABLE = 'jarvis_memories';

export interface JarvisMemoryRepository {
  list(scope: Pick<JarvisMemoryScope, 'organizationId'>): Promise<JarvisMemory[]>;
  insert(memory: JarvisMemoryCandidate): Promise<JarvisMemory>;
  update(id: string, patch: Partial<JarvisMemory>): Promise<void>;
  deleteWhere(scope: Pick<JarvisMemoryScope, 'organizationId'> & Partial<JarvisMemoryScope> & { id?: string; key?: string; memoryType?: JarvisMemory['memoryType'] }): Promise<number>;
}

function database() {
  const base = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
  if (!base || !key) throw new Error('JARVIS memory storage is not configured. Run the memory SQL migration and configure Supabase.');
  return { url: `${base}/rest/v1/${TABLE}`, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

function rowToMemory(row: Record<string, unknown>): JarvisMemory {
  return {
    id: String(row.id), memoryType: row.memory_type as JarvisMemory['memoryType'], origin: row.origin as JarvisMemory['origin'],
    scope: { organizationId: String(row.organization_id), userId: row.user_id ? String(row.user_id) : undefined, sessionId: row.session_id ? String(row.session_id) : undefined, entityType: row.entity_type ? String(row.entity_type) : undefined, entityId: row.entity_id ? String(row.entity_id) : undefined },
    key: String(row.key), value: (row.value_json || {}) as Record<string, unknown>, summary: String(row.summary),
    source: { type: row.source_type as JarvisMemory['source']['type'], referenceId: row.source_reference ? String(row.source_reference) : undefined },
    confidence: row.confidence == null ? undefined : Number(row.confidence), evidenceCount: row.evidence_count == null ? undefined : Number(row.evidence_count),
    createdBy: row.created_by as JarvisMemory['createdBy'], createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    lastVerifiedAt: row.last_verified_at ? String(row.last_verified_at) : undefined, expiresAt: row.expires_at ? String(row.expires_at) : null, status: row.status as JarvisMemory['status'],
  };
}

export class SupabaseJarvisMemoryRepository implements JarvisMemoryRepository {
  async list(scope: Pick<JarvisMemoryScope, 'organizationId'>): Promise<JarvisMemory[]> {
    const db = database();
    const response = await fetch(`${db.url}?organization_id=eq.${encodeURIComponent(scope.organizationId)}&status=eq.active&select=*`, { headers: db.headers });
    if (!response.ok) throw new Error(`Unable to retrieve JARVIS memories (${response.status}).`);
    return (await response.json() as Record<string, unknown>[]).map(rowToMemory);
  }

  async insert(candidate: JarvisMemoryCandidate): Promise<JarvisMemory> {
    const db = database(); const now = new Date().toISOString(); const id = randomUUID();
    const response = await fetch(db.url, { method: 'POST', headers: { ...db.headers, Prefer: 'return=representation' }, body: JSON.stringify({
      id, organization_id: candidate.scope.organizationId, user_id: candidate.scope.userId || null, session_id: candidate.scope.sessionId || null,
      entity_type: candidate.scope.entityType || null, entity_id: candidate.scope.entityId || null, memory_type: candidate.memoryType, origin: candidate.origin,
      key: candidate.key, value_json: candidate.value, summary: candidate.summary, source_type: candidate.source.type, source_reference: candidate.source.referenceId || null,
      confidence: candidate.confidence ?? null, evidence_count: candidate.evidenceCount ?? null, created_by: candidate.createdBy, expires_at: candidate.expiresAt ?? null,
      created_at: now, updated_at: now,
    }) });
    if (!response.ok) throw new Error(`Unable to store JARVIS memory (${response.status}).`);
    return rowToMemory((await response.json() as Record<string, unknown>[])[0]);
  }

  async update(id: string, patch: Partial<JarvisMemory>): Promise<void> {
    const db = database();
    const body: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.status) body.status = patch.status;
    if (patch.lastVerifiedAt) body.last_verified_at = patch.lastVerifiedAt;
    if (patch.expiresAt !== undefined) body.expires_at = patch.expiresAt;
    if (patch.summary) body.summary = patch.summary;
    if (patch.value) body.value_json = patch.value;
    const response = await fetch(`${db.url}?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: db.headers, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(`Unable to update JARVIS memory (${response.status}).`);
  }

  async deleteWhere(scope: Pick<JarvisMemoryScope, 'organizationId'> & Partial<JarvisMemoryScope> & { id?: string; key?: string; memoryType?: JarvisMemory['memoryType'] }): Promise<number> {
    const db = database(); const filters = [`organization_id=eq.${encodeURIComponent(scope.organizationId)}`];
    if (scope.id) filters.push(`id=eq.${encodeURIComponent(scope.id)}`); if (scope.key) filters.push(`key=eq.${encodeURIComponent(scope.key)}`); if (scope.userId) filters.push(`user_id=eq.${encodeURIComponent(scope.userId)}`);
    if (scope.sessionId) filters.push(`session_id=eq.${encodeURIComponent(scope.sessionId)}`); if (scope.entityType) filters.push(`entity_type=eq.${encodeURIComponent(scope.entityType)}`);
    if (scope.entityId) filters.push(`entity_id=eq.${encodeURIComponent(scope.entityId)}`); if (scope.memoryType) filters.push(`memory_type=eq.${encodeURIComponent(scope.memoryType)}`);
    const response = await fetch(`${db.url}?${filters.join('&')}`, { method: 'DELETE', headers: { ...db.headers, Prefer: 'return=representation' } });
    if (!response.ok) throw new Error(`Unable to delete JARVIS memory (${response.status}).`);
    return (await response.json() as unknown[]).length;
  }
}

/** Small deterministic test double; production always uses Supabase. */
export class InMemoryJarvisMemoryRepository implements JarvisMemoryRepository {
  records: JarvisMemory[] = [];
  async list(scope: Pick<JarvisMemoryScope, 'organizationId'>) { return this.records.filter(memory => memory.scope.organizationId === scope.organizationId); }
  async insert(candidate: JarvisMemoryCandidate) { const now = new Date().toISOString(); const memory: JarvisMemory = { ...candidate, id: randomUUID(), createdAt: now, updatedAt: now, status: 'active', expiresAt: candidate.expiresAt ?? null }; this.records.push(memory); return memory; }
  async update(id: string, patch: Partial<JarvisMemory>) { const index = this.records.findIndex(memory => memory.id === id); if (index >= 0) this.records[index] = { ...this.records[index], ...patch, updatedAt: new Date().toISOString() }; }
  async deleteWhere(scope: Pick<JarvisMemoryScope, 'organizationId'> & Partial<JarvisMemoryScope> & { id?: string; key?: string; memoryType?: JarvisMemory['memoryType'] }) { const before = this.records.length; this.records = this.records.filter(memory => !(memory.scope.organizationId === scope.organizationId && (!scope.id || memory.id === scope.id) && (!scope.key || memory.key === scope.key) && (!scope.userId || memory.scope.userId === scope.userId) && (!scope.sessionId || memory.scope.sessionId === scope.sessionId) && (!scope.entityId || memory.scope.entityId === scope.entityId) && (!scope.memoryType || memory.memoryType === scope.memoryType))); return before - this.records.length; }
}
