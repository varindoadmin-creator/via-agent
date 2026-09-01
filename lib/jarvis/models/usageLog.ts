// ─── Durable model usage log ───────────────────────────────────────────────────
// VIA Phase 13, brief section 48: `lib/jarvis/runner.ts` already computes
// token usage and estimated cost on every run; this module is the first
// place that durably persists it (previously it only ever reached Cloud
// Run's stdout via console.info). Best-effort and never throws — matching
// every other analytics-recording side channel in this codebase
// (lib/analytics/events.ts's recordAnalyticsEvent).

import { supabaseInsert } from '../../supabase/rest.ts';

const TABLE = 'jarvis_model_usage_log';

export interface RecordModelUsageInput {
  runId: string;
  conversationId?: string | null;
  model: string;
  routingTier?: string | null;
  routingReason?: string | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  modelRequests: number;
  pricingAvailable: boolean;
  estimatedCostUsd?: number | null;
  latencyMs?: number | null;
}

export async function recordModelUsage(input: RecordModelUsageInput): Promise<void> {
  try {
    await supabaseInsert(TABLE, {
      run_id: input.runId, conversation_id: input.conversationId ?? null,
      model: input.model, routing_tier: input.routingTier ?? null, routing_reason: input.routingReason ?? null,
      input_tokens: input.inputTokens, output_tokens: input.outputTokens, total_tokens: input.totalTokens,
      model_requests: input.modelRequests, pricing_available: input.pricingAvailable,
      estimated_cost_usd: input.estimatedCostUsd ?? null, latency_ms: input.latencyMs ?? null,
    }, false);
  } catch (error) {
    console.error('[jarvis.models.usageLog] failed to record usage:', error);
  }
}
