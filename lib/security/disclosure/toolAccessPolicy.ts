// ─── Tool access policy ──────────────────────────────────────────────────────
// Brief section 6/27: filter tools BEFORE the model sees them. Generic over
// any tool-shaped array (rather than importing lib/jarvis/tools/registry.ts
// directly) so this stays independently testable and reusable — the real
// registry's ~20 definitions are all internal-only today (none set
// `allowedActorTypes`), which the default-to-internal fallback below proves
// without needing this module to import that whole tool/agent dependency
// tree. Phase 5+ wires real customer-facing tools through this the same way.

import type { ActorType } from './audience.ts';

export interface AudienceAwareTool {
  name: string;
  /** Absent = internal-only by default. A tool must explicitly opt into external exposure. */
  allowedActorTypes?: readonly ActorType[];
}

export function isToolAllowedForActor<T extends AudienceAwareTool>(tool: T, actorType: ActorType): boolean {
  const allowed = tool.allowedActorTypes ?? ['INTERNAL_USER', 'SYSTEM'];
  return allowed.includes(actorType);
}

/** Filters a tool list to only what's allowed for the given actor — the mandatory pre-model gate. */
export function getToolsForActor<T extends AudienceAwareTool>(actorType: ActorType, tools: readonly T[]): T[] {
  return tools.filter(tool => isToolAllowedForActor(tool, actorType));
}
