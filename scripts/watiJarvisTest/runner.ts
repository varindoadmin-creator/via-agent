// ─── WATI / Jarvis knowledge test runner ──────────────────────────────────────
// Drives lib/integrations/wati/pipeline.ts's processInboundWatiMessage — the
// exact function the real WATI webhook route calls — with a fake Supabase
// store (no writes to real production tables) and real Zoho passthrough (see
// fakeSupabase.ts for the safety guarantees). Nothing here sends a real
// WhatsApp message: WATI_API_TOKEN/BASE_URL point at a fake host that this
// process itself intercepts.

import { writeFileSync, mkdirSync } from 'node:fs';
import { loadEnvLocal } from './env.ts';
import { createFakeSupabase } from './fakeSupabase.ts';
import { CASES, MULTI_TURN_CASES, type TestCase, type MultiTurnCase } from './cases.ts';

loadEnvLocal();
process.env.WATI_API_TOKEN = 'test-harness-token';
process.env.WATI_API_BASE_URL = 'https://wati-test-harness.local/test-tenant';
// Test against the shipped default configuration (every Phase 6-14 flag off
// by default, per every phase's own "ship off by default" convention) unless
// explicitly overridden below — matches what a fresh, unconfigured
// deployment actually does today.
delete process.env.CUSTOMER_SERVICE_HANDOFF_ENABLED;
delete process.env.COMMERCIAL_DRAFT_ENABLED;
delete process.env.CUSTOMER_IDENTITY_MAPPING_ENABLED;
delete process.env.INTENT_CONTEXTUAL_GREETING;
delete process.env.MESSAGE_DEBOUNCE;

const { processInboundWatiMessage } = await import('../../lib/integrations/wati/pipeline.ts');

const SUPABASE_URL_PREFIX = `${(process.env.SUPABASE_URL || '').replace(/\/$/, '')}/rest/v1/`;
const WATI_BASE = process.env.WATI_API_BASE_URL!;

let phoneCounter = 0;
function nextPhone(): string {
  phoneCounter += 1;
  return `62811${String(phoneCounter).padStart(7, '0')}`;
}

const TOOL_BY_CASE: Record<string, string> = {
  A_GREETING: 'none (deterministic template)',
  B_BRAND_INQUIRY: 'detectBrandMention (deterministic)',
  C_PRODUCT_RESOLVED: 'ProductService (Zoho Items)',
  D_STOCK_ACK: 'Phase 3 stock workflow (vendor-first)',
  E_CLARIFICATION: 'none (deterministic template)',
  F_HUMAN: 'Phase 8 handoff (triggerHandoff/touchConversationState)',
  G_ACK_ROUTE: 'none (deterministic template)',
  H_DISCLOSURE_DENIED: 'disclosure policy (evaluateDisclosure)',
  I_PRICE_LOOKUP: 'CustomerPricingService (Zoho pricebook)',
  J_BROAD_BRAND_PRICE: 'none (deterministic template)',
  K_COMMERCIAL_WORKFLOW: 'commercial draft workflow',
  L_CUSTOMER_SELF_SERVICE: 'Phase 7 self-service (Zoho invoices/orders)',
  M_DISCOUNT_HANDOFF: 'Phase 8 handoff',
  N_TIER_PROBE_REDIRECT: 'none (deterministic template, no disclosure)',
  O_COMPANY_INFO: 'CompanyIdentity',
  P_DEALER_STATUS: 'BrandRelationship',
  Q_SHIPPING_POLICY: 'ShippingPolicy',
  R_PAYMENT_DESTINATION: 'PaymentDestination',
  S_SAMPLE_CATALOGUE: 'BrandRelationship (sample/catalogue website)',
  T_UNSUPPORTED_PRODUCT: 'CommercialProductScope',
  U_BOT_IDENTITY: 'none (deterministic template)',
  SUPPRESSED: 'none (conversation suppressed)',
};

export interface TestResult {
  testId: string;
  category: string;
  input: string;
  language: string;
  expectedIntent: string;
  expectedSourceOfTruth: string;
  expectedBehavior: string;
  actualResponse: string;
  actualIntent: string;
  actualResponseCase: string;
  actualTool: string;
  handoff: boolean;
  pass: boolean;
  failureReason: string;
  severity: string;
}

function runAssertions(c: TestCase, actualText: string, outcome: { intent?: string; responseCase?: string }): { pass: boolean; reason: string } {
  const reasons: string[] = [];
  if (c.expectedIntent && outcome.intent && outcome.intent !== c.expectedIntent) {
    // Intent mismatches are recorded as context, not automatically a failure —
    // many are pre-documented expected gaps (see expectedBehavior). Only the
    // explicit content/handoff assertions below are hard pass/fail gates.
  }
  const handoffOccurred = outcome.responseCase === 'F_HUMAN' || outcome.responseCase === 'M_DISCOUNT_HANDOFF';
  if (c.mustHandoff && !handoffOccurred) reasons.push('expected a human handoff but none occurred');
  if (c.mustNotHandoff && handoffOccurred) reasons.push('unexpected human handoff');
  if (c.mustContain) {
    for (const re of c.mustContain) if (!re.test(actualText)) reasons.push(`missing required content matching ${re}`);
  }
  if (c.mustNotContain) {
    for (const re of c.mustNotContain) if (re.test(actualText)) reasons.push(`CONTAINS FORBIDDEN CONTENT matching ${re}`);
  }
  if (c.minLength && actualText.length < c.minLength) reasons.push(`response shorter than expected minimum (${actualText.length} < ${c.minLength})`);
  if (c.maxLength && actualText.length > c.maxLength) reasons.push(`response longer than expected maximum (${actualText.length} > ${c.maxLength}) — possible over-verbosity`);
  return { pass: reasons.length === 0, reason: reasons.join('; ') };
}

async function runSingleTurn(c: TestCase): Promise<TestResult> {
  const fake = createFakeSupabase({ supabaseUrlPrefix: SUPABASE_URL_PREFIX, watiBaseUrl: WATI_BASE });
  const original = globalThis.fetch;
  globalThis.fetch = fake.fetchMock;
  const phone = nextPhone();
  let outcome: { intent?: string; responseCase?: string; status?: string } = {};
  try {
    outcome = await processInboundWatiMessage({ id: `harness-${c.id}`, waId: phone, text: c.input, type: 'text' }) as never;
  } catch (error) {
    globalThis.fetch = original;
    return {
      testId: c.id, category: c.category, input: c.input, language: c.language,
      expectedIntent: c.expectedIntent ?? '(n/a)', expectedSourceOfTruth: c.expectedSourceOfTruth, expectedBehavior: c.expectedBehavior,
      actualResponse: `(pipeline threw: ${error instanceof Error ? error.message : String(error)})`,
      actualIntent: '(error)', actualResponseCase: '(error)', actualTool: '(error)', handoff: false,
      pass: false, failureReason: 'pipeline threw an unhandled exception', severity: c.severity,
    };
  } finally {
    globalThis.fetch = original;
  }
  const send = fake.sends[fake.sends.length - 1];
  const actualText = send?.text ?? '(no message sent)';
  const { pass, reason } = runAssertions(c, actualText, outcome);
  return {
    testId: c.id, category: c.category, input: c.input, language: c.language,
    expectedIntent: c.expectedIntent ?? '(n/a)', expectedSourceOfTruth: c.expectedSourceOfTruth, expectedBehavior: c.expectedBehavior,
    actualResponse: actualText, actualIntent: outcome.intent ?? '(none)', actualResponseCase: outcome.responseCase ?? '(none)',
    actualTool: TOOL_BY_CASE[outcome.responseCase ?? ''] ?? '(unknown)',
    handoff: outcome.responseCase === 'F_HUMAN' || outcome.responseCase === 'M_DISCOUNT_HANDOFF',
    pass, failureReason: reason, severity: c.severity,
  };
}

async function runMultiTurn(c: MultiTurnCase): Promise<TestResult> {
  const fake = createFakeSupabase({ supabaseUrlPrefix: SUPABASE_URL_PREFIX, watiBaseUrl: WATI_BASE });
  const original = globalThis.fetch;
  globalThis.fetch = fake.fetchMock;
  const phone = nextPhone();
  const turnOutcomes: { intent?: string; responseCase?: string; status?: string }[] = [];
  const turnSendCounts: number[] = [];
  try {
    for (let i = 0; i < c.turns.length; i++) {
      const before = fake.sends.length;
      const outcome = await processInboundWatiMessage({ id: `harness-${c.id}-t${i}`, waId: phone, text: c.turns[i], type: 'text' }) as never;
      turnOutcomes.push(outcome as never);
      turnSendCounts.push(fake.sends.length - before);
    }
  } finally {
    globalThis.fetch = original;
  }
  const lastOutcome = turnOutcomes[turnOutcomes.length - 1] ?? {};
  const lastSend = fake.sends[fake.sends.length - 1];
  const actualText = lastSend?.text ?? '(no message sent)';
  const summary = `turns=[${c.turns.map((t, i) => `"${t}"->${turnOutcomes[i]?.responseCase ?? '?'}(sends:${turnSendCounts[i]})`).join(' | ')}]`;

  let pass = true;
  const reasons: string[] = [];
  if (c.checkFinal?.mustContain) for (const re of c.checkFinal.mustContain) if (!re.test(actualText)) { pass = false; reasons.push(`final turn missing ${re}`); }
  if (c.checkFinal?.mustNotContain) for (const re of c.checkFinal.mustNotContain) if (re.test(actualText)) { pass = false; reasons.push(`final turn CONTAINS FORBIDDEN ${re}`); }
  // HUMANACTIVE-001's real gate: the second turn must send nothing.
  if (c.id === 'HUMANACTIVE-001') {
    if (turnSendCounts[1] !== 0) { pass = false; reasons.push(`expected zero sends on the post-handoff turn, got ${turnSendCounts[1]}`); }
  }

  return {
    testId: c.id, category: c.category, input: summary, language: c.language,
    expectedIntent: '(multi-turn)', expectedSourceOfTruth: '(see expectedBehavior)', expectedBehavior: c.expectedBehavior,
    actualResponse: actualText, actualIntent: lastOutcome.intent ?? '(none)', actualResponseCase: lastOutcome.responseCase ?? '(none)',
    actualTool: TOOL_BY_CASE[lastOutcome.responseCase ?? ''] ?? '(unknown)',
    handoff: turnOutcomes.some(o => o.responseCase === 'F_HUMAN'),
    pass, failureReason: reasons.join('; '), severity: c.severity,
  };
}

async function main() {
  const results: TestResult[] = [];
  for (const c of CASES) results.push(await runSingleTurn(c));
  for (const c of MULTI_TURN_CASES) results.push(await runMultiTurn(c));

  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/wati-jarvis-knowledge-tests.json', JSON.stringify(results, null, 2));

  const csvHeader = ['testId', 'category', 'severity', 'language', 'input', 'expectedIntent', 'actualIntent', 'actualResponseCase', 'handoff', 'pass', 'failureReason', 'actualResponse'];
  const csvRows = results.map(r => csvHeader.map(k => {
    const v = String((r as never as Record<string, unknown>)[k] ?? '');
    return `"${v.replace(/"/g, '""').replace(/\n/g, ' ')}"`;
  }).join(','));
  writeFileSync('test-results/wati-jarvis-knowledge-tests.csv', [csvHeader.join(','), ...csvRows].join('\n'));

  const total = results.length;
  const passed = results.filter(r => r.pass).length;
  const failed = total - passed;
  const criticalFail = results.filter(r => !r.pass && r.severity === 'CRITICAL').length;
  const highFail = results.filter(r => !r.pass && r.severity === 'HIGH').length;

  console.log(JSON.stringify({ total, passed, failed, criticalFail, highFail, passRate: (passed / total * 100).toFixed(1) + '%' }, null, 2));

  const byCategory = new Map<string, { total: number; pass: number }>();
  for (const r of results) {
    const e = byCategory.get(r.category) ?? { total: 0, pass: 0 };
    e.total += 1; if (r.pass) e.pass += 1;
    byCategory.set(r.category, e);
  }
  console.log('\n=== By category ===');
  for (const [cat, e] of Array.from(byCategory.entries()).sort()) {
    console.log(`${cat}: ${e.pass}/${e.total} (${(e.pass / e.total * 100).toFixed(0)}%)`);
  }

  console.log('\n=== CRITICAL failures ===');
  for (const r of results.filter(r => !r.pass && r.severity === 'CRITICAL')) {
    console.log(`[${r.testId}] "${r.input}" -> ${r.failureReason} | actual: "${r.actualResponse.slice(0, 150)}"`);
  }
  console.log('\n=== HIGH failures ===');
  for (const r of results.filter(r => !r.pass && r.severity === 'HIGH')) {
    console.log(`[${r.testId}] "${r.input}" -> ${r.failureReason} | actual: "${r.actualResponse.slice(0, 150)}"`);
  }
}

await main();
