import type { Role } from '@/lib/auth';
import { defaultMemoryExpiry, isExpired, memoryEligibility, normalizedPreferenceKey, rankMemory } from './policy.ts';
import type { JarvisMemoryRepository } from './repository.ts';
import { SupabaseJarvisMemoryRepository } from './repository.ts';
import type { JarvisMemory, JarvisMemoryCandidate, MemoryRetrievalInput } from './types.ts';

const MAX_MEMORIES_PER_REQUEST = 5;
const MAX_MEMORIES_PER_ENTITY = 2;

function sameScope(left: JarvisMemory, candidate: JarvisMemoryCandidate): boolean {
  return left.memoryType === candidate.memoryType && left.key === candidate.key &&
    left.scope.organizationId === candidate.scope.organizationId && left.scope.userId === candidate.scope.userId &&
    left.scope.sessionId === candidate.scope.sessionId && left.scope.entityType === candidate.scope.entityType && left.scope.entityId === candidate.scope.entityId;
}

export class JarvisMemoryService {
  private readonly repository: JarvisMemoryRepository;

  constructor(repository: JarvisMemoryRepository = new SupabaseJarvisMemoryRepository()) {
    this.repository = repository;
  }

  async store(candidate: JarvisMemoryCandidate): Promise<{ memory?: JarvisMemory; rejected?: string; superseded?: string[] }> {
    const eligibility = memoryEligibility(candidate);
    if (!eligibility.eligible) return { rejected: eligibility.reason };
    const active = (await this.repository.list(candidate.scope)).filter(memory => !isExpired(memory));
    const duplicate = active.find(memory => sameScope(memory, candidate) && JSON.stringify(memory.value) === JSON.stringify(candidate.value));
    if (duplicate) {
      await this.repository.update(duplicate.id, { summary: candidate.summary, value: candidate.value, expiresAt: candidate.expiresAt ?? duplicate.expiresAt, lastVerifiedAt: candidate.origin === 'DERIVED' ? new Date().toISOString() : duplicate.lastVerifiedAt });
      return { memory: { ...duplicate, summary: candidate.summary, value: candidate.value }, superseded: [] };
    }

    const conflictingPreferences = candidate.memoryType === 'user_preference'
      ? active.filter(memory => memory.memoryType === 'user_preference' && memory.key === candidate.key && memory.scope.userId === candidate.scope.userId)
      : [];
    await Promise.all(conflictingPreferences.map(memory => this.repository.update(memory.id, { status: 'superseded' })));
    const memory = await this.repository.insert({ ...candidate, expiresAt: candidate.expiresAt ?? defaultMemoryExpiry(candidate.memoryType) });
    return { memory, superseded: conflictingPreferences.map(memory => memory.id) };
  }

  async retrieveRelevant(input: MemoryRetrievalInput): Promise<JarvisMemory[]> {
    const records = await this.repository.list({ organizationId: input.organizationId });
    const matching = records
      .filter(memory => !isExpired(memory))
      .filter(memory => (!memory.scope.userId || memory.scope.userId === input.userId) && (!memory.scope.sessionId || memory.scope.sessionId === input.sessionId || memory.memoryType !== 'conversation'))
      .filter(memory => !memory.scope.entityId || input.entities?.some(entity => entity.id === memory.scope.entityId && entity.type === memory.scope.entityType))
      .sort((a, b) => rankMemory(b, input) - rankMemory(a, input));

    const entityCounts = new Map<string, number>();
    const selected: JarvisMemory[] = [];
    for (const memory of matching) {
      const entityKey = memory.scope.entityId ? `${memory.scope.entityType}:${memory.scope.entityId}` : 'global';
      if ((entityCounts.get(entityKey) || 0) >= MAX_MEMORIES_PER_ENTITY) continue;
      selected.push(memory); entityCounts.set(entityKey, (entityCounts.get(entityKey) || 0) + 1);
      if (selected.length >= Math.min(input.limit || MAX_MEMORIES_PER_REQUEST, MAX_MEMORIES_PER_REQUEST)) break;
    }
    return selected;
  }

  async verify(id: string): Promise<void> { await this.repository.update(id, { lastVerifiedAt: new Date().toISOString() }); }

  async expire(): Promise<number> {
    const records = await this.repository.list({ organizationId: organizationId() });
    const expired = records.filter(memory => memory.status === 'active' && isExpired(memory));
    await Promise.all(expired.map(memory => this.repository.update(memory.id, { status: 'expired' })));
    return expired.length;
  }

  async forget(input: { organizationId: string; userId?: string; sessionId?: string; entityType?: string; entityId?: string; memoryType?: JarvisMemory['memoryType']; id?: string; key?: string }): Promise<number> {
    return this.repository.deleteWhere(input);
  }
}

export function organizationId(): string { return process.env.VIA_ORGANIZATION_ID || 'varindo'; }

/** Deterministic v1 extraction: only explicit, stable presentation preferences. */
export function explicitPreferenceCandidate(input: { message: string; role: Role; userId: string; sessionId: string; organizationId?: string }): JarvisMemoryCandidate | null {
  if (!/\b(always|selalu|from now on|ke depan)\b/i.test(input.message)) return null;
  const key = normalizedPreferenceKey(input.message);
  if (!key) return null;
  const value = key === 'response.currency_scale' ? { currency: 'IDR', scale: 'millions' }
    : key === 'response.length' ? { length: /\b(detailed|detail|rinci)\b/i.test(input.message) ? 'detailed' : 'concise' }
      : { format: 'table' };
  return {
    memoryType: 'user_preference', origin: 'EXPLICIT', scope: { organizationId: input.organizationId || organizationId(), userId: input.userId }, key, value,
    summary: `User explicitly prefers ${key === 'response.currency_scale' ? 'financial figures in IDR millions' : key === 'response.length' ? (/\b(detailed|detail|rinci)\b/i.test(input.message) ? 'detailed responses' : 'concise responses') : 'tables for comparisons'}.`,
    source: { type: 'explicit_user_preference', referenceId: input.sessionId }, createdBy: input.role, expiresAt: null,
  };
}

export function explicitForgetPreferenceKey(message: string): string | null {
  if (!/\b(forget|hapus|lupakan)\b/i.test(message)) return null;
  return normalizedPreferenceKey(message);
}
