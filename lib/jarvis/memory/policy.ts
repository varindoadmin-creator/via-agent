import type { JarvisMemoryCandidate, JarvisMemory, JarvisMemoryType } from './types.ts';

const VOLATILE_FACTS = /\b(current\s+)?(stock|stok|balance|saldo|invoice\s+status|po\s+status|price|harga|selling\s+price|available\s+quantity)\b/i;
const SECRET_MARKERS = /\b(api[ _-]?key|access[ _-]?token|oauth|password|secret|bearer)\b/i;
const INSTRUCTION_MARKERS = /\b(ignore (all|previous|system)|override (all|system)|delete (the )?(invoice|customer|record)|reveal (the )?(secret|token|password))\b/i;

const DEFAULT_TTL_MS: Record<JarvisMemoryType, number | null> = {
  conversation: 30 * 24 * 60 * 60 * 1_000,
  user_preference: null,
  business_pattern: 180 * 24 * 60 * 60 * 1_000,
};

export function defaultMemoryExpiry(type: JarvisMemoryType, now = Date.now()): string | null {
  const ttl = DEFAULT_TTL_MS[type];
  return ttl == null ? null : new Date(now + ttl).toISOString();
}

export function isExpired(memory: Pick<JarvisMemory, 'expiresAt' | 'status'>, now = Date.now()): boolean {
  return memory.status !== 'active' || Boolean(memory.expiresAt && new Date(memory.expiresAt).getTime() <= now);
}

export function memoryEligibility(candidate: JarvisMemoryCandidate): { eligible: boolean; reason?: string } {
  const content = `${candidate.key}\n${candidate.summary}\n${JSON.stringify(candidate.value)}`;
  if (!candidate.scope.organizationId) return { eligible: false, reason: 'organization_scope_required' };
  if (!candidate.key.trim() || !candidate.summary.trim()) return { eligible: false, reason: 'key_and_summary_required' };
  if (SECRET_MARKERS.test(content)) return { eligible: false, reason: 'secrets_are_never_memory' };
  if (INSTRUCTION_MARKERS.test(content)) return { eligible: false, reason: 'memory_content_cannot_be_system_instruction' };
  if (VOLATILE_FACTS.test(content)) return { eligible: false, reason: 'volatile_live_business_fact' };
  if (candidate.memoryType === 'business_pattern' && (!candidate.source.type || !candidate.evidenceCount || candidate.evidenceCount < 2)) {
    return { eligible: false, reason: 'business_pattern_requires_provenance_and_repeated_evidence' };
  }
  if (candidate.memoryType === 'user_preference' && candidate.origin !== 'EXPLICIT') {
    return { eligible: false, reason: 'only_explicit_user_preferences_are_saved_in_v1' };
  }
  return { eligible: true };
}

export function normalizedPreferenceKey(text: string): string | null {
  const lower = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (/\b(idr|rupiah)\b[\s\S]{0,80}\b(million|millions|juta)\b/.test(lower)) return 'response.currency_scale';
  if (/\b(concise|short|ringkas|singkat|detailed|detail|rinci)\b/.test(lower)) return 'response.length';
  if (/\btable|tabel\b/.test(lower)) return 'response.format';
  return null;
}

export function rankMemory(memory: JarvisMemory, input: { userId: string; sessionId: string; entities?: Array<{ type: string; id: string }>; request: string }, now = Date.now()): number {
  if (isExpired(memory, now)) return Number.NEGATIVE_INFINITY;
  let score = 0;
  if (memory.scope.userId === input.userId) score += 35;
  if (memory.scope.sessionId === input.sessionId) score += 45;
  if (input.entities?.some(entity => entity.type === memory.scope.entityType && entity.id === memory.scope.entityId)) score += 50;
  if (input.request.toLowerCase().includes(memory.key.replace(/[._-]/g, ' ').toLowerCase())) score += 10;
  if (memory.memoryType === 'business_pattern') score += 12 * (memory.confidence || 0);
  if (memory.lastVerifiedAt) score += Math.max(0, 10 - (now - new Date(memory.lastVerifiedAt).getTime()) / (30 * 24 * 60 * 60 * 1_000));
  score += Math.max(0, 8 - (now - new Date(memory.updatedAt).getTime()) / (30 * 24 * 60 * 60 * 1_000));
  return score;
}
