import type { Role } from '@/lib/auth';

export const JARVIS_MEMORY_TYPES = ['conversation', 'user_preference', 'business_pattern'] as const;
export type JarvisMemoryType = typeof JARVIS_MEMORY_TYPES[number];
export type JarvisMemoryStatus = 'active' | 'expired' | 'superseded' | 'deleted';
export type JarvisMemoryOrigin = 'EXPLICIT' | 'INFERRED' | 'DERIVED';

export interface JarvisMemoryScope {
  organizationId: string;
  userId?: string;
  sessionId?: string;
  entityType?: string;
  entityId?: string;
}

export interface JarvisMemorySource {
  type: 'explicit_user_preference' | 'conversation_summary' | 'historical_sales_analysis' | 'tool_result' | 'manual_admin_entry' | 'verified_entity_resolution';
  referenceId?: string;
}

export interface JarvisMemory {
  id: string;
  memoryType: JarvisMemoryType;
  origin: JarvisMemoryOrigin;
  scope: JarvisMemoryScope;
  key: string;
  value: Record<string, unknown>;
  summary: string;
  source: JarvisMemorySource;
  confidence?: number;
  evidenceCount?: number;
  createdBy: Role | 'system';
  createdAt: string;
  updatedAt: string;
  lastVerifiedAt?: string;
  expiresAt?: string | null;
  status: JarvisMemoryStatus;
}

export interface JarvisMemoryCandidate {
  memoryType: JarvisMemoryType;
  origin: JarvisMemoryOrigin;
  scope: JarvisMemoryScope;
  key: string;
  value: Record<string, unknown>;
  summary: string;
  source: JarvisMemorySource;
  confidence?: number;
  evidenceCount?: number;
  createdBy: Role | 'system';
  expiresAt?: string | null;
}

export interface MemoryRetrievalInput {
  organizationId: string;
  userId: string;
  sessionId: string;
  role: Role;
  entities?: Array<{ type: string; id: string }>;
  domains?: string[];
  request: string;
  limit?: number;
}

export interface JarvisMemoryObservation {
  query: { count: number; memoryIds: string[] };
  candidate?: { action: 'stored' | 'rejected' | 'forgotten'; key?: string; reason?: string };
}

/** Never use this ordering to replace an authoritative current-data lookup. */
export const JARVIS_SOURCE_PRECEDENCE = [
  'live_via_or_zoho_data',
  'current_workflow_state',
  'official_knowledge_or_policy',
  'verified_business_pattern_memory',
  'conversation_memory',
  'user_preference_memory',
  'general_model_knowledge',
] as const;
