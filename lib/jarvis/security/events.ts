import type { JarvisSecurityDecisionCode } from './policy';

export interface JarvisSecurityEvent {
  timestamp: string;
  requestId: string;
  conversationId: string;
  event: 'authorization_decision' | 'untrusted_content_detected';
  code: JarvisSecurityDecisionCode | 'PROMPT_INJECTION_SIGNAL';
  subject: string;
  allowed?: boolean;
  details?: { indicatorCount?: number };
}

export function recordJarvisSecurityEvent(events: JarvisSecurityEvent[], event: JarvisSecurityEvent): void {
  events.push(event);
  // Deliberately omit customer data, tool input, secrets, and document text.
  console.info('[jarvis.security]', JSON.stringify(event));
}
