import assert from 'node:assert/strict';
import test from 'node:test';
import { approvalLevelForAction, requiresApproval } from './approvalPolicy.ts';

test('Test 9 — reorder opportunities always require review, regardless of the commercial-outreach flag', () => {
  delete process.env.AUTO_COMMERCIAL_OUTREACH_ENABLED;
  assert.equal(approvalLevelForAction('REORDER_OPPORTUNITY', 'WHATSAPP'), 'REQUIRES_REVIEW');
  process.env.AUTO_COMMERCIAL_OUTREACH_ENABLED = 'true';
  assert.equal(approvalLevelForAction('REORDER_OPPORTUNITY', 'WHATSAPP'), 'REQUIRES_REVIEW');
  delete process.env.AUTO_COMMERCIAL_OUTREACH_ENABLED;
});

test('Test 26 — dormant-customer re-engagement always requires review, regardless of flags', () => {
  process.env.AUTO_COMMERCIAL_OUTREACH_ENABLED = 'true';
  process.env.AUTO_SERVICE_FOLLOWUP_ENABLED = 'true';
  assert.equal(approvalLevelForAction('DORMANT_CUSTOMER_REENGAGEMENT', 'WHATSAPP'), 'REQUIRES_REVIEW');
  delete process.env.AUTO_COMMERCIAL_OUTREACH_ENABLED;
  delete process.env.AUTO_SERVICE_FOLLOWUP_ENABLED;
});

test('an INTERNAL_TASK is always AUTO_ALLOWED — it never reaches the customer', () => {
  assert.equal(approvalLevelForAction('INACTIVE_COMMERCIAL_DRAFT', 'INTERNAL_TASK'), 'AUTO_ALLOWED');
  assert.equal(approvalLevelForAction('DORMANT_CUSTOMER_REENGAGEMENT', 'INTERNAL_TASK'), 'AUTO_ALLOWED');
});

test('quotation follow-up requires review by default and only becomes auto-allowed when AUTO_COMMERCIAL_OUTREACH_ENABLED is on', () => {
  delete process.env.AUTO_COMMERCIAL_OUTREACH_ENABLED;
  assert.equal(approvalLevelForAction('QUOTATION_FOLLOW_UP', 'WHATSAPP'), 'REQUIRES_REVIEW');
  process.env.AUTO_COMMERCIAL_OUTREACH_ENABLED = 'true';
  assert.equal(approvalLevelForAction('QUOTATION_FOLLOW_UP', 'WHATSAPP'), 'AUTO_ALLOWED');
  delete process.env.AUTO_COMMERCIAL_OUTREACH_ENABLED;
});

test('requiresApproval mirrors the approval level correctly', () => {
  assert.equal(requiresApproval('AUTO_ALLOWED'), false);
  assert.equal(requiresApproval('REQUIRES_REVIEW'), true);
  assert.equal(requiresApproval('PROHIBITED'), true);
});
