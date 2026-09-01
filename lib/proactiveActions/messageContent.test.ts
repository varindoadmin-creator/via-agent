import assert from 'node:assert/strict';
import test from 'node:test';
import { quotationFollowUpMessage, buildMessageForAction, type MessageFacts } from './messageContent.ts';
import type { ProactiveActionType } from './types.ts';

const FORBIDDEN_WORDS = /\b(tier|diskon|discount|markup|margin|hpp|harga beli|modal)\b/i;

const ALL_TYPES: ProactiveActionType[] = [
  'ORDER_INTENT_FOLLOW_UP', 'REORDER_OPPORTUNITY', 'SAMPLE_REQUEST_FOLLOW_UP',
  'DORMANT_CUSTOMER_REENGAGEMENT', 'SERVICE_RECOVERY', 'NEEDS_INFORMATION_FOLLOW_UP',
];

test('Test 41 — no proactive message ever mentions Tier, discount, or internal cost wording', () => {
  const facts: MessageFacts = { companyName: 'PT ABC', productName: 'ATP11358M', brand: 'LAMITAK' };
  for (const type of ALL_TYPES) {
    const message = buildMessageForAction(type, facts);
    assert.ok(message, `expected a template for ${type}`);
    assert.doesNotMatch(message!, FORBIDDEN_WORDS, `${type} message leaked internal pricing language: ${message}`);
  }
  assert.doesNotMatch(quotationFollowUpMessage(facts, 'INITIAL_FOLLOW_UP'), FORBIDDEN_WORDS);
  assert.doesNotMatch(quotationFollowUpMessage(facts, 'FINAL_FOLLOW_UP'), FORBIDDEN_WORDS);
});

test('Test 42/6 — a quotation is never described as expired unless the caller explicitly says so', () => {
  const facts: MessageFacts = { companyName: 'PT ABC', quotationNumber: 'EST-001' };
  const message = quotationFollowUpMessage(facts, 'INITIAL_FOLLOW_UP');
  assert.doesNotMatch(message, /melewati masa berlaku|expired|kadaluarsa/i);
});

test('a quotation with facts.quotationExpired=true is described as expired only then', () => {
  const facts: MessageFacts = { companyName: 'PT ABC', quotationNumber: 'EST-001', quotationExpired: true };
  const message = quotationFollowUpMessage(facts, 'INITIAL_FOLLOW_UP');
  assert.match(message, /melewati masa berlaku/i);
});

test('reorder message never states a specific cadence like "every N days" (brief section 28)', () => {
  const message = buildMessageForAction('REORDER_OPPORTUNITY', { productName: 'ATP11358M' });
  assert.ok(message);
  assert.doesNotMatch(message!, /\bhari\b|\bdays\b/i);
});

test('a final-stage quotation follow-up mentions closing the follow-up, never adds pressure or fabricated scarcity', () => {
  const message = quotationFollowUpMessage({ companyName: 'PT ABC' }, 'FINAL_FOLLOW_UP');
  assert.doesNotMatch(message, /stok hampir habis|terbatas|segera/i);
});
