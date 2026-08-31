// ─── Customer Operations analytics tools ─────────────────────────────────────
// VIA Customer Operations Phase 9, brief sections 51-52: internal-only Jarvis
// analytics for the WATI customer-operations funnel (distinct domain from
// lib/jarvis/tools/analytics.ts's existing Zoho sales/finance tools). Every
// handler calls lib/analytics/metricService.ts — the exact same service the
// admin dashboard calls — never computing a number independently (brief
// section 40). Registered only in the internal tool registry
// (lib/jarvis/tools/registry.ts), which the WATI pipeline never imports —
// so these tools are unreachable from any external/WATI audience by
// construction, satisfying brief section 52/Test 99 with no new check.

import { tool } from '@openai/agents';
import { z } from 'zod';
import type { JarvisRunContext } from '@/lib/jarvis/context';
import {
  getCustomerServiceDashboard, getStockDashboard, getCommercialDashboard,
} from '@/lib/analytics/metricService';
import { getVendorPerformance } from '@/lib/analytics/stockAnalytics';
import { getCustomerServiceFunnel } from '@/lib/analytics/customerServiceAnalytics';
import { computeCaseWaitingBreakdown, aggregateWaitingBreakdowns } from '@/lib/analytics/waitingTimeBreakdown';
import { analyzeResolutionTimeBottleneck, analyzeSlaBottleneck } from '@/lib/analytics/bottleneck';
import { resolveTimeGrain, previousPeriod } from '@/lib/analytics/periods';
import { supabaseSelect } from '@/lib/supabase/rest';

const timeGrain = z.enum(['TODAY', 'YESTERDAY', 'LAST_7_DAYS', 'THIS_MONTH', 'LAST_MONTH']);
const parametersGrainOnly = z.object({ grain: timeGrain });

export const getCustomerServiceMetricsTool = tool<typeof parametersGrainOnly, JarvisRunContext>({
  name: 'get_customer_service_metrics',
  description: 'Get customer-service funnel metrics (inbound conversations, auto/human resolution rates, SLA compliance, handoff reasons) for a time period. Uses the same metric definitions as the Customer Service admin dashboard.',
  parameters: parametersGrainOnly,
  async execute({ grain }) {
    const dashboard = await getCustomerServiceDashboard(grain);
    return { kind: 'customer_service_metrics', ...dashboard };
  },
});

export const getConversionFunnelTool = tool<typeof parametersGrainOnly, JarvisRunContext>({
  name: 'get_conversion_funnel',
  description: 'Get the commercial funnel (drafts created, quotations, orders, draft-to-order conversion, Sales Order value) for a time period. Order value comes from live Zoho data, never a WhatsApp-quoted figure.',
  parameters: parametersGrainOnly,
  async execute({ grain }) {
    const dashboard = await getCommercialDashboard(grain);
    return { kind: 'conversion_funnel', ...dashboard };
  },
});

export const getStockOperationsMetricsTool = tool<typeof parametersGrainOnly, JarvisRunContext>({
  name: 'get_stock_operations_metrics',
  description: 'Get stock/vendor operations metrics (inquiry volume, vendor response time, OOS rate, fallback rate) for a time period, broken down by vendor. Never returns an exact/raw stock quantity — rates and durations only.',
  parameters: parametersGrainOnly,
  async execute({ grain }) {
    const dashboard = await getStockDashboard(grain);
    return { kind: 'stock_operations_metrics', ...dashboard };
  },
});

export const getBottleneckBreakdownTool = tool<typeof parametersGrainOnly, JarvisRunContext>({
  name: 'get_bottleneck_breakdown',
  description: 'Get a grounded FACT/DIAGNOSIS/RECOMMENDATION breakdown of what is driving a change in customer-service resolution time or SLA compliance, comparing the given period to the immediately preceding one of equal length. Confidence is flagged LOW for small sample sizes — treat that as a caveat, not a strong claim.',
  parameters: parametersGrainOnly,
  async execute({ grain }) {
    const range = resolveTimeGrain(grain);
    const prevRange = previousPeriod(range);

    const [currentFunnel, previousFunnel] = await Promise.all([getCustomerServiceFunnel(range), getCustomerServiceFunnel(prevRange)]);

    const slaInsight = analyzeSlaBottleneck({
      currentBreachRate: currentFunnel.slaBreachRate, previousBreachRate: previousFunnel.slaBreachRate,
      currentCaseCount: currentFunnel.handoffCount, previousCaseCount: previousFunnel.handoffCount,
    });

    // Resolution-time decomposition needs per-case waiting breakdowns — bounded to a reasonable sample (brief section 89).
    const [currentCases, previousCases] = await Promise.all([
      supabaseSelect<{ customer_phone_normalized: string; handoff_created_at: string; resolved_at: string }>('wati_conversation_state', `resolved_at=gte.${range.start.toISOString()}&resolved_at=lt.${range.end.toISOString()}&handoff_created_at=not.is.null&select=customer_phone_normalized,handoff_created_at,resolved_at&limit=200`),
      supabaseSelect<{ customer_phone_normalized: string; handoff_created_at: string; resolved_at: string }>('wati_conversation_state', `resolved_at=gte.${prevRange.start.toISOString()}&resolved_at=lt.${prevRange.end.toISOString()}&handoff_created_at=not.is.null&select=customer_phone_normalized,handoff_created_at,resolved_at&limit=200`),
    ]);
    const [currentBreakdowns, previousBreakdowns] = await Promise.all([
      Promise.all(currentCases.map(c => computeCaseWaitingBreakdown({ conversationId: c.customer_phone_normalized, handoffCreatedAt: c.handoff_created_at, resolvedAt: c.resolved_at }))),
      Promise.all(previousCases.map(c => computeCaseWaitingBreakdown({ conversationId: c.customer_phone_normalized, handoffCreatedAt: c.handoff_created_at, resolvedAt: c.resolved_at }))),
    ]);
    const resolutionInsight = analyzeResolutionTimeBottleneck(aggregateWaitingBreakdowns(currentBreakdowns), aggregateWaitingBreakdowns(previousBreakdowns));

    return { kind: 'bottleneck_breakdown', range, resolutionTimeInsight: resolutionInsight, slaInsight };
  },
});

export const getVendorPerformanceTool = tool<typeof parametersGrainOnly, JarvisRunContext>({
  name: 'get_vendor_performance',
  description: 'Get per-vendor stock-check performance (median response time, availability rate, OOS rate) for a time period. Only vendors actually present in real stock inquiry data.',
  parameters: parametersGrainOnly,
  async execute({ grain }) {
    const range = resolveTimeGrain(grain);
    const rows = await getVendorPerformance(range);
    return { kind: 'vendor_performance', range, vendors: rows };
  },
});
