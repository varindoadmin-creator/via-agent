import type { Role } from '@/lib/auth';

export interface JarvisRunContext {
  role: Role;
  conversationId: string;
  requestId: string;
  cache: Map<string, unknown>;
}
