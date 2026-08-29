import type { JarvisToolAuditEvent } from './context';
import type { JarvisModelRoute } from './models/types';

export const JARVIS_INTENTS = ['LOOKUP', 'ANALYZE', 'COMPARE', 'DIAGNOSE', 'RECOMMEND', 'PRIORITIZE', 'SCENARIO', 'PREPARE_ACTION', 'EXECUTE_ACTION', 'EXPLAIN'] as const;
export type JarvisIntent = typeof JARVIS_INTENTS[number];

export const JARVIS_DOMAINS = ['customer', 'sales', 'products', 'inventory', 'operations', 'purchasing', 'finance', 'receivables', 'vendors', 'analytics', 'knowledge', 'system'] as const;
export type JarvisDomain = typeof JARVIS_DOMAINS[number];

export type JarvisRunState = 'IDLE' | 'UNDERSTANDING' | 'INVESTIGATING' | 'WAITING_FOR_USER' | 'WAITING_FOR_APPROVAL' | 'EXECUTING' | 'COMPLETED' | 'FAILED' | 'LIMITED';
export type JarvisRunOutcome = 'answered_with_verified_data' | 'answered_without_tools' | 'awaiting_approval' | 'waiting_for_user' | 'limited_by_data_or_service' | 'failed';

export interface JarvisRequestProfile {
  goal: string;
  intent: JarvisIntent;
  domains: JarvisDomain[];
  needsLiveData: boolean;
  actionRequested: boolean;
  riskLevel: 'READ' | 'ANALYZE' | 'PREPARE' | 'WRITE';
  missingRequiredInformation: string[];
}

export interface JarvisOrchestrationTrace {
  runId: string;
  startedAt: string;
  completedAt?: string;
  state: JarvisRunState;
  profile: JarvisRequestProfile;
  selectedTools: string[];
  decisions: string[];
  errors: Array<{ code: string; tool?: string }>;
  outcome?: JarvisRunOutcome;
  totalDurationMs?: number;
  model?: string;
  modelRouting?: Pick<JarvisModelRoute, 'configVersion' | 'eligibleModelIds' | 'fallbackModelIds' | 'routingReason' | 'forced'> & {
    tier: JarvisModelRoute['requirements']['tier'];
    selectedModel: string;
  };
}

const DOMAIN_HINTS: Array<[JarvisDomain, RegExp]> = [
  ['inventory', /\b(stock|stok|inventory|gudang|warehouse|shipment|pengiriman|fulfil|fulfill)\b/i],
  ['purchasing', /\b(po|purchase order|pembelian|supplier|vendor|mirpo)\b/i],
  ['receivables', /\b(receivable|piutang|utang|owe|overdue|jatuh tempo|aging)\b/i],
  ['finance', /\b(profit|gross profit|gp|margin|cash|payment|bank|reconciliation|biaya)\b/i],
  ['sales', /\b(sales order|\bso\b|sales|penjualan|invoice|revenue|omzet|discount|diskon)\b/i],
  ['customer', /\b(customer|pelanggan|client|contact)\b/i],
  ['products', /\b(item|sku|product|produk|price|harga|price list)\b/i],
  ['analytics', /\b(analy[sz]e|analysis|trend|growth|report|compare|comparison|turun|naik|bulan|month)\b/i],
  ['operations', /\b(operational|operasi|approval|approved|confirmed|draft)\b/i],
  ['knowledge', /\b(how to|cara|policy|kebijakan|feature|fitur|menu)\b/i],
];

function inferIntent(message: string): JarvisIntent {
  if (/^\s*approve create so\s*$/i.test(message)) return 'EXECUTE_ACTION';
  if (/\b(create|prepare|buat|bikin|siapkan|draft)\b.*\b(sales order|\bso\b)\b/i.test(message)) return 'PREPARE_ACTION';
  if (/\b(why|kenapa|mengapa|cause|penyebab|problem|masalah)\b/i.test(message)) return 'DIAGNOSE';
  if (/\b(scenario|skenario|what if|jika .*pulih|kalau .*pulih|recovery rate)\b/i.test(message)) return 'SCENARIO';
  if (/\b(prioriti[sz]e|priority|prioritas|which customer|pelanggan mana)\b/i.test(message)) return 'PRIORITIZE';
  if (/\b(recommend|recommendation|suggest|saran|sarankan|should|sebaiknya)\b/i.test(message)) return 'RECOMMEND';
  if (/\b(compare|comparison|vs\.?|versus|compared|banding|naik|turun)\b/i.test(message)) return 'COMPARE';
  if (/\b(analy[sz]e|analysis|analisa|analisis|trend|growth|report)\b/i.test(message)) return 'ANALYZE';
  if (/\b(how much|berapa|how many|jumlah|stock|stok|available|tersedia|find|cari|show me|tampilkan)\b/i.test(message)) return 'LOOKUP';
  if (/\b(how|cara|what is|apa itu|explain|jelaskan|where|di mana)\b/i.test(message)) return 'EXPLAIN';
  return 'LOOKUP';
}

function inferDomains(message: string): JarvisDomain[] {
  const domains = DOMAIN_HINTS.filter(([, expression]) => expression.test(message)).map(([domain]) => domain);
  return domains.length ? domains : ['system'];
}

export function createJarvisRequestProfile(message: string): JarvisRequestProfile {
  const intent = inferIntent(message);
  const domains = inferDomains(message);
  const actionRequested = intent === 'PREPARE_ACTION' || intent === 'EXECUTE_ACTION';
  const needsLiveData = intent !== 'EXPLAIN' || !domains.includes('knowledge');
  const riskLevel = intent === 'EXECUTE_ACTION' ? 'WRITE' : intent === 'PREPARE_ACTION' ? 'PREPARE' : ['ANALYZE', 'COMPARE', 'DIAGNOSE', 'RECOMMEND', 'PRIORITIZE', 'SCENARIO'].includes(intent) ? 'ANALYZE' : 'READ';
  const missingRequiredInformation: string[] = [];
  if (intent === 'PREPARE_ACTION' && !/\b\d+(?:[.,]\d+)?\b/.test(message)) missingRequiredInformation.push('quantity');

  return {
    goal: message.replace(/\s+/g, ' ').trim().slice(0, 500), intent, domains, needsLiveData,
    actionRequested, riskLevel, missingRequiredInformation,
  };
}

export function createJarvisOrchestrationTrace(runId: string, message: string, model: string): JarvisOrchestrationTrace {
  return {
    runId,
    startedAt: new Date().toISOString(),
    state: 'UNDERSTANDING',
    profile: createJarvisRequestProfile(message),
    selectedTools: [],
    decisions: ['Request classified; use the minimum verified VIA evidence needed.'],
    errors: [],
    model,
  };
}

export function recordJarvisToolSelection(trace: JarvisOrchestrationTrace, tool: string): void {
  if (!trace.selectedTools.includes(tool)) trace.selectedTools.push(tool);
  if (trace.state === 'UNDERSTANDING') trace.state = 'INVESTIGATING';
}

export function completeJarvisOrchestration(trace: JarvisOrchestrationTrace, audit: JarvisToolAuditEvent[], hasPreview: boolean): JarvisOrchestrationTrace {
  const failures = audit.filter(event => !event.success);
  trace.errors = failures.map(event => ({ code: event.errorCode || 'TOOL_EXECUTION_FAILED', tool: event.tool }));
  trace.completedAt = new Date().toISOString();
  trace.totalDurationMs = Math.max(0, new Date(trace.completedAt).getTime() - new Date(trace.startedAt).getTime());

  if (hasPreview) {
    trace.state = 'WAITING_FOR_APPROVAL';
    trace.outcome = 'awaiting_approval';
    trace.decisions.push('Validated preview prepared; explicit approval is required before any Zoho write.');
  } else if (failures.length > 0 && !audit.some(event => event.success)) {
    trace.state = 'LIMITED';
    trace.outcome = 'limited_by_data_or_service';
    trace.decisions.push('Investigation stopped because verified VIA evidence was unavailable.');
  } else if (audit.length > 0) {
    trace.state = 'COMPLETED';
    trace.outcome = 'answered_with_verified_data';
    trace.decisions.push('Stopped after sufficient verified tool evidence was gathered.');
  } else {
    trace.state = 'COMPLETED';
    trace.outcome = 'answered_without_tools';
  }
  return trace;
}

export function buildJarvisRoutingInstructions(trace: JarvisOrchestrationTrace): string {
  const profile = trace.profile;
  return [
    'Current routing context (a non-authoritative hint, not business evidence):',
    `Goal: ${profile.goal}`,
    `Likely intent: ${profile.intent}; domains: ${profile.domains.join(', ')}; live data likely needed: ${profile.needsLiveData ? 'yes' : 'no'}.`,
    'Use this only to select the minimum useful tools. Inspect each observation before deciding whether another call is useful. Do not mention this routing context to the user.',
  ].join('\n');
}
