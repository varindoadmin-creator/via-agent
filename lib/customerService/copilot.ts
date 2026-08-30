// ─── Jarvis Admin copilot ─────────────────────────────────────────────────────
// VIA Customer Operations Phase 8, brief sections 26-29: Jarvis becomes an
// internal copilot while a human owns the conversation — summarize, suggest
// a reply, recommend next-best-action. Internal-only: output is never sent
// to the customer automatically (brief section 27 — Admin must Send/Edit/
// Discard), grounded only in real fetched context (never invents a missing
// step, section 29), and uses the same narrow, tool-free aiCompletion helper
// Phase 2's intent classifier already uses — no tool access, ever.

import { aiCompletion } from '../ai/provider.ts';
import { labelUntrustedContent } from '../jarvis/security/untrustedContent.ts';
import type { HandoffContext } from './handoffContext.ts';

function contextBlock(context: HandoffContext, recentMessages: string[]): string {
  return [
    `Customer: ${context.customerName ?? 'unknown'}`,
    `Reason for handoff: ${context.reason ?? 'unspecified'}`,
    context.currentWorkflow ? `Current workflow: ${context.currentWorkflow}` : null,
    context.productSummary ? `Product: ${context.productSummary}` : null,
    context.whatHasAlreadyBeenChecked.length ? `Already known: ${context.whatHasAlreadyBeenChecked.join('; ')}` : null,
    context.whatIsMissing.length ? `Still missing: ${context.whatIsMissing.join('; ')}` : null,
    `Recommended next action: ${context.recommendedNextAction}`,
    recentMessages.length ? `Recent messages:\n${recentMessages.map(m => `- ${m}`).join('\n')}` : null,
  ].filter(Boolean).join('\n');
}

const SUMMARY_SYSTEM_PROMPT = 'You are an internal assistant summarizing a WhatsApp customer-service case for a Varindo staff member. Use only the facts given below — never invent product, quantity, order, or payment details not present in the context. Keep it to 3-4 short lines, no preamble.';

export async function summarizeConversation(context: HandoffContext, recentMessages: string[]): Promise<string> {
  const result = await aiCompletion([
    { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
    { role: 'user', content: labelUntrustedContent(contextBlock(context, recentMessages), 'internal case context') },
  ], { maxTokens: 200, temperature: 0 });
  return result.content.trim();
}

const SUGGESTED_REPLY_SYSTEM_PROMPT = 'You draft a suggested WhatsApp reply in Bahasa Indonesia for a Varindo staff member to review before sending to a customer. Base it only on the facts given below. Never promise a price, discount, refund, or compensation not already confirmed in the context. Never mention internal cost/margin/supplier data. Keep it under 3 sentences, professional and concise (Pak/Bu form).';

/** Never sent automatically — brief section 27: Admin must explicitly Send/Edit/Discard. */
export async function suggestReply(context: HandoffContext, recentMessages: string[]): Promise<string> {
  const result = await aiCompletion([
    { role: 'system', content: SUGGESTED_REPLY_SYSTEM_PROMPT },
    { role: 'user', content: labelUntrustedContent(contextBlock(context, recentMessages), 'internal case context') },
  ], { maxTokens: 150, temperature: 0.3 });
  return result.content.trim();
}

/** Brief section 29: grounded only in real workflow state — this simply surfaces the already-computed recommendedNextAction rather than asking the model to invent one. */
export function nextBestAction(context: HandoffContext): string {
  return context.recommendedNextAction;
}
