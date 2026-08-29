import type { Role } from '@/lib/auth';
import type { JarvisOrchestrationTrace } from './orchestration';
import type { JarvisContextPackage } from './contextBuilder';
import type { JarvisSecurityIdentity } from './security/policy';
import type { JarvisSecurityEvent } from './security/events';

export interface JarvisToolAuditEvent {
  tool: string;
  category: string;
  risk: string;
  role: Role;
  conversationId: string;
  requestId: string;
  timestamp: string;
  inputSummary: { fields: string[]; itemCount?: number };
  success: boolean;
  durationMs: number;
  errorCode?: string;
}

export interface JarvisRunContext {
  role: Role;
  security: JarvisSecurityIdentity;
  conversationId: string;
  requestId: string;
  cache: Map<string, unknown>;
  toolAudit: JarvisToolAuditEvent[];
  orchestration: JarvisOrchestrationTrace;
  contextPackage: JarvisContextPackage;
  toolSignatures: Map<string, number>;
  /** Ephemeral, in-process state for this run only. It is never persisted as long-term memory. */
  workingMemory: Map<string, unknown>;
  memoryObservation: { queriedIds: string[]; candidate?: { action: 'stored' | 'rejected' | 'forgotten'; key?: string; reason?: string } };
  securityEvents: JarvisSecurityEvent[];
}
