// ─── Model cost summary ────────────────────────────────────────────────────────
// VIA Phase 13, brief section 48: a read-only summary over
// jarvis_model_usage_log. Never fabricates a cost figure when pricing was
// not configured for a given run — `costEstimateComplete` tells the caller
// whether every counted run had pricing available, so a dashboard can
// honestly label a partial total as partial rather than presenting it as
// exact (matching the existing "never present stale hard-coded price
// estimates as facts" principle from docs/jarvis-model-routing-cost-engineering.md).

import { supabaseSelect } from '../../supabase/rest.ts';
import type { DateRange } from '../../analytics/periods.ts';

const TABLE = 'jarvis_model_usage_log';

interface UsageRow {
  model: string; routing_tier: string | null; conversation_id: string | null;
  input_tokens: number; output_tokens: number; total_tokens: number; model_requests: number;
  pricing_available: boolean; estimated_cost_usd: number | null;
}

export interface ModelCostSummary {
  range: DateRange;
  totalRequests: number;
  totalTokens: number;
  totalEstimatedCostUsd: number;
  /** False when at least one counted run had no pricing configured — the total above is a partial sum, not the true total. */
  costEstimateComplete: boolean;
  distinctConversations: number;
  costPerConversationUsd: number | null;
  byModel: Array<{ model: string; requests: number; tokens: number; estimatedCostUsd: number; costEstimateComplete: boolean }>;
  byTier: Array<{ tier: string; requests: number; tokens: number; estimatedCostUsd: number; costEstimateComplete: boolean }>;
}

export async function getModelCostSummary(range: DateRange): Promise<ModelCostSummary> {
  const rows = await supabaseSelect<UsageRow>(
    TABLE,
    `created_at=gte.${range.start.toISOString()}&created_at=lt.${range.end.toISOString()}&select=model,routing_tier,conversation_id,input_tokens,output_tokens,total_tokens,model_requests,pricing_available,estimated_cost_usd&limit=10000`,
  );

  function aggregate(key: (row: UsageRow) => string) {
    const groups = new Map<string, { requests: number; tokens: number; estimatedCostUsd: number; complete: boolean }>();
    for (const row of rows) {
      const k = key(row);
      const entry = groups.get(k) ?? { requests: 0, tokens: 0, estimatedCostUsd: 0, complete: true };
      entry.requests += row.model_requests;
      entry.tokens += row.total_tokens;
      if (row.pricing_available && row.estimated_cost_usd != null) entry.estimatedCostUsd += row.estimated_cost_usd;
      else entry.complete = false;
      groups.set(k, entry);
    }
    return groups;
  }

  const byModelMap = aggregate(row => row.model);
  const byTierMap = aggregate(row => row.routing_tier || 'UNKNOWN');

  const totalRequests = rows.reduce((sum, row) => sum + row.model_requests, 0);
  const totalTokens = rows.reduce((sum, row) => sum + row.total_tokens, 0);
  const totalEstimatedCostUsd = rows.reduce((sum, row) => sum + (row.pricing_available && row.estimated_cost_usd != null ? row.estimated_cost_usd : 0), 0);
  const costEstimateComplete = rows.every(row => row.pricing_available);
  const distinctConversations = new Set(rows.map(row => row.conversation_id).filter(Boolean)).size;

  return {
    range, totalRequests, totalTokens, totalEstimatedCostUsd, costEstimateComplete, distinctConversations,
    costPerConversationUsd: distinctConversations > 0 && costEstimateComplete ? totalEstimatedCostUsd / distinctConversations : null,
    byModel: Array.from(byModelMap.entries()).map(([model, v]) => ({ model, requests: v.requests, tokens: v.tokens, estimatedCostUsd: v.estimatedCostUsd, costEstimateComplete: v.complete })),
    byTier: Array.from(byTierMap.entries()).map(([tier, v]) => ({ tier, requests: v.requests, tokens: v.tokens, estimatedCostUsd: v.estimatedCostUsd, costEstimateComplete: v.complete })),
  };
}
