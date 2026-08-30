import { getJarvisRuntimeConfig } from './config.ts';
import { redact } from '../../redact.ts';

export const JARVIS_FEEDBACK_TYPES = ['helpful', 'not_helpful', 'correction', 'failure'] as const;
export type JarvisFeedbackType = typeof JARVIS_FEEDBACK_TYPES[number];

export interface JarvisFeedbackInput {
  runId: string;
  conversationId: string;
  actorRole: string;
  type: JarvisFeedbackType;
  note?: string;
}

export function normalizeJarvisFeedback(input: JarvisFeedbackInput) {
  return {
    run_id: input.runId.trim().slice(0, 160),
    conversation_id: input.conversationId.trim().slice(0, 160),
    actor_role: input.actorRole.trim().slice(0, 80),
    feedback_type: input.type,
    note: input.note ? redact(input.note) : null,
    release_id: getJarvisRuntimeConfig().releaseId,
  };
}

export async function storeJarvisFeedback(input: JarvisFeedbackInput): Promise<'stored' | 'disabled' | 'unavailable'> {
  const config = getJarvisRuntimeConfig();
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!config.feedbackSchemaEnabled) return 'disabled';
  if (!url || !key) return 'unavailable';
  const response = await fetch(`${url.replace(/\/$/, '')}/rest/v1/jarvis_feedback`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(normalizeJarvisFeedback(input)),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`feedback_store_${response.status}`);
  return 'stored';
}
