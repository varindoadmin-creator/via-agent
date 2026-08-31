import type { FunctionTool } from '@openai/agents';
import type { Role } from '@/lib/auth';
import type { JarvisRunContext, JarvisToolAuditEvent } from '@/lib/jarvis/context';
import { recordJarvisToolSelection } from '@/lib/jarvis/orchestration';
import { prepareSalesOrderTool } from './actions';
import { analyzeSalesDriversTool, analyzeSalesPeriodsTool, boardroomSalesBriefTool, identifyCustomerOpportunitiesTool, runCustomerRecoveryScenarioTool } from './analytics';
import { analyzeReceivablesTool, getOperationalPipelineTool } from './executiveData';
import { findViaFeatureTool } from './features';
import { analyzeGrossProfitTool, analyzeInventoryRiskTool } from './financeOperations';
import { assessOrderFulfillmentTool } from './fulfillment';
import { searchKnowledgeTool } from './knowledge';
import {
  getCustomerPriceTool, getCustomerTool, getItemTool, getOpenPurchaseOrdersForItemTool,
  getPurchaseOrderTool, getSalesOrderTool, searchPurchaseOrdersTool, searchSalesOrdersTool,
} from './operations';
import { getItemStockTool, searchCustomerTool, searchItemTool } from './zoho';
import {
  getCustomerServiceMetricsTool, getConversionFunnelTool, getStockOperationsMetricsTool,
  getBottleneckBreakdownTool, getVendorPerformanceTool,
} from './customerOperationsAnalytics';
import {
  getOpenOperationalFindingsTool, getPriorityFindingsTool, getFindingDetailTool, getOperationalBriefTool,
  acknowledgeFindingTool, assignFindingTool, createActionPlanTool, closeFindingTool,
} from './operationalIntelligence';
import { authorizeJarvisAction, permissionForTool, type JarvisPermission } from '@/lib/jarvis/security/policy';
import { recordJarvisSecurityEvent } from '@/lib/jarvis/security/events';
import { classifyJarvisFailure, JarvisReliabilityError } from '@/lib/jarvis/reliability/errors';
import { jarvisCircuitBreaker } from '@/lib/jarvis/reliability/circuitBreaker';
import { withTimeout } from '@/lib/jarvis/reliability/timeout';
export { JARVIS_TOOL_LABELS } from './catalog';

export const JARVIS_TOOL_CATEGORIES = ['customer', 'products', 'sales', 'inventory', 'purchasing', 'finance', 'analytics', 'knowledge', 'system'] as const;
export type JarvisToolCategory = typeof JARVIS_TOOL_CATEGORIES[number];
export type JarvisToolRisk = 'READ' | 'ANALYZE' | 'PREPARE' | 'WRITE' | 'HIGH_RISK';
export type JarvisToolStatus = 'ready' | 'protected' | 'future';

type AnyJarvisTool = FunctionTool<JarvisRunContext, any, any>;

export interface JarvisToolDefinition {
  name: string;
  label: string;
  description: string;
  category: JarvisToolCategory;
  risk: JarvisToolRisk;
  permissions: readonly JarvisPermission[];
  requiredRole: Role;
  status: JarvisToolStatus;
  source: 'VIA' | 'Zoho Books' | 'VIA + Zoho Books';
  inputContract: string;
  outputContract: string;
  timeoutMs?: number;
  handler: AnyJarvisTool;
}

const RESULT_CONTRACT = 'Structured result with source, evidence, warnings, and a stable error field when data cannot be verified.';
const read = (name: string, label: string, description: string, category: JarvisToolCategory, source: JarvisToolDefinition['source'], inputContract: string, handler: AnyJarvisTool): JarvisToolDefinition => ({ name, label, description, category, risk: 'READ', permissions: [permissionForTool({ name, category, risk: 'READ' })], requiredRole: 'director', status: 'ready', source, inputContract, outputContract: RESULT_CONTRACT, timeoutMs: 15_000, handler });
const analyze = (name: string, label: string, description: string, category: JarvisToolCategory, source: JarvisToolDefinition['source'], inputContract: string, handler: AnyJarvisTool): JarvisToolDefinition => ({ name, label, description, category, risk: 'ANALYZE', permissions: [permissionForTool({ name, category, risk: 'ANALYZE' })], requiredRole: 'director', status: 'ready', source, inputContract, outputContract: RESULT_CONTRACT, timeoutMs: 30_000, handler });
const write = (name: string, label: string, description: string, category: JarvisToolCategory, source: JarvisToolDefinition['source'], inputContract: string, handler: AnyJarvisTool): JarvisToolDefinition => ({ name, label, description, category, risk: 'WRITE', permissions: [permissionForTool({ name, category, risk: 'WRITE' })], requiredRole: 'director', status: 'ready', source, inputContract, outputContract: RESULT_CONTRACT, timeoutMs: 15_000, handler });

const definitions: JarvisToolDefinition[] = [
  read('find_via_feature', 'VIA feature lookup', 'Find the appropriate existing VIA feature or report.', 'system', 'VIA', 'Feature query', findViaFeatureTool),
  read('search_customer', 'Customer lookup', 'Find active Zoho customers by exact or partial name.', 'customer', 'Zoho Books', 'Customer query', searchCustomerTool),
  read('get_customer', 'Customer details', 'Retrieve one Zoho customer using an exact customer ID.', 'customer', 'Zoho Books', 'Customer ID', getCustomerTool),
  read('search_item', 'Item lookup', 'Find active Zoho items by SKU or item name.', 'products', 'Zoho Books', 'Item query', searchItemTool),
  read('get_item', 'Item details', 'Retrieve one Zoho item using an exact item ID.', 'products', 'Zoho Books', 'Item ID', getItemTool),
  read('get_customer_price', 'Customer price lookup', 'Retrieve the official current Zoho price for a customer and item.', 'sales', 'VIA + Zoho Books', 'Customer ID and item ID', getCustomerPriceTool),
  read('get_item_stock', 'System stock lookup', 'Retrieve current Zoho system stock for an exact item.', 'inventory', 'Zoho Books', 'Item ID', getItemStockTool),
  read('search_sales_orders', 'Sales Order lookup', 'Search existing Zoho Sales Orders.', 'sales', 'Zoho Books', 'Sales Order search criteria', searchSalesOrdersTool),
  read('get_sales_order', 'Sales Order details', 'Retrieve one Zoho Sales Order using an exact ID.', 'sales', 'Zoho Books', 'Sales Order ID', getSalesOrderTool),
  analyze('assess_order_fulfillment', 'Order fulfilment analysis', 'Assess current system stock and open PO coverage for a proposed order.', 'inventory', 'VIA + Zoho Books', 'Exact customer and item IDs with quantity', assessOrderFulfillmentTool),
  read('search_purchase_orders', 'Purchase Order lookup', 'Search existing Zoho Purchase Orders.', 'purchasing', 'Zoho Books', 'Purchase Order search criteria', searchPurchaseOrdersTool),
  read('get_purchase_order', 'Purchase Order details', 'Retrieve one Zoho Purchase Order using an exact ID.', 'purchasing', 'Zoho Books', 'Purchase Order ID', getPurchaseOrderTool),
  read('get_open_purchase_orders_for_item', 'Open PO coverage', 'Find current open Purchase Order coverage for one item.', 'purchasing', 'Zoho Books', 'Item ID', getOpenPurchaseOrdersForItemTool),
  { name: 'prepare_sales_order', label: 'Sales Order preview', description: 'Prepare a validated Sales Order preview only; the separate exact approval creates the Zoho draft.', category: 'sales', risk: 'PREPARE', permissions: ['sales_order.prepare'], requiredRole: 'director', status: 'protected', source: 'VIA + Zoho Books', inputContract: 'Exact customer ID, item IDs, quantities, notes', outputContract: 'Persisted preview with approval reference; no Zoho record is created.', handler: prepareSalesOrderTool },
  analyze('analyze_sales_periods', 'Sales performance analysis', 'Compare verified issued-invoice sales periods.', 'analytics', 'Zoho Books', 'Explicit date ranges', analyzeSalesPeriodsTool),
  analyze('analyze_sales_drivers', 'Sales driver analysis', 'Attribute a verified sales-period movement to customers and salespersons.', 'analytics', 'Zoho Books', 'Two explicit date ranges', analyzeSalesDriversTool),
  analyze('identify_customer_opportunities', 'Customer opportunity analysis', 'Rank declining or inactive customers for approval-ready follow-up.', 'analytics', 'Zoho Books', 'Two explicit date ranges', identifyCustomerOpportunitiesTool),
  analyze('run_customer_recovery_scenario', 'Customer recovery scenario', 'Model a non-executing recovery assumption for one verified customer decline.', 'analytics', 'Zoho Books', 'Two date ranges, customer name, recovery rate', runCustomerRecoveryScenarioTool),
  analyze('boardroom_sales_brief', 'Boardroom sales brief', 'Produce a verified sales-only executive summary.', 'analytics', 'Zoho Books', 'Explicit date ranges', boardroomSalesBriefTool),
  analyze('analyze_receivables', 'Receivables analysis', 'Analyze current outstanding invoices and aging.', 'finance', 'Zoho Books', 'Optional date or customer filters', analyzeReceivablesTool),
  analyze('get_operational_pipeline', 'Operational pipeline', 'Summarize current Sales Order and Purchase Order workload.', 'sales', 'Zoho Books', 'Optional operational filters', getOperationalPipelineTool),
  analyze('analyze_gross_profit', 'Gross profit analysis', 'Analyze monthly gross profit using current Zoho purchase-rate costs.', 'finance', 'Zoho Books', 'Reporting month and grouping', analyzeGrossProfitTool),
  analyze('analyze_inventory_risk', 'Inventory risk analysis', 'Analyze portfolio-level inventory exceptions using current system data.', 'inventory', 'VIA + Zoho Books', 'Optional stock-risk filters', analyzeInventoryRiskTool),
  read('search_knowledge', 'Knowledge search', 'Search approved static VIA policies and Zoho concepts.', 'knowledge', 'VIA', 'Knowledge query', searchKnowledgeTool),
  analyze('get_customer_service_metrics', 'Customer service metrics', 'Get customer-service funnel metrics (inbound conversations, auto/human resolution rates, SLA compliance, handoff reasons) for a time period.', 'analytics', 'VIA', 'Time-period grain', getCustomerServiceMetricsTool),
  analyze('get_conversion_funnel', 'Conversion funnel', 'Get the commercial funnel (drafts, quotations, orders, draft-to-order conversion, Sales Order value) for a time period.', 'analytics', 'VIA', 'Time-period grain', getConversionFunnelTool),
  analyze('get_stock_operations_metrics', 'Stock operations metrics', 'Get stock/vendor operations metrics (inquiry volume, vendor response time, OOS rate, fallback rate) for a time period, by vendor.', 'analytics', 'VIA', 'Time-period grain', getStockOperationsMetricsTool),
  analyze('get_bottleneck_breakdown', 'Bottleneck breakdown', 'Get a FACT/DIAGNOSIS/RECOMMENDATION breakdown of what is driving a change in customer-service resolution time or SLA compliance vs. the prior period.', 'analytics', 'VIA', 'Time-period grain', getBottleneckBreakdownTool),
  analyze('get_vendor_performance', 'Vendor performance', 'Get per-vendor stock-check performance (median response time, availability rate, OOS rate) for a time period.', 'analytics', 'VIA', 'Time-period grain', getVendorPerformanceTool),
  read('get_open_operational_findings', 'Open operational findings', 'List currently open operational findings, optionally filtered by category.', 'analytics', 'VIA', 'Optional category filter', getOpenOperationalFindingsTool),
  read('get_priority_findings', 'Priority findings', 'Get open operational findings ranked by a transparent priority score.', 'analytics', 'VIA', 'None', getPriorityFindingsTool),
  read('get_finding_detail', 'Finding detail', 'Get the full detail, evidence, and post-action outcome for one operational finding.', 'analytics', 'VIA', 'Exact finding ID', getFindingDetailTool),
  read('get_operational_brief', 'Operational brief', 'Get today\'s top 3-5 operational findings plus one commercial opportunity highlight.', 'analytics', 'VIA', 'None', getOperationalBriefTool),
  write('acknowledge_finding', 'Acknowledge finding', 'Acknowledge an open operational finding.', 'analytics', 'VIA', 'Exact finding ID and expected version', acknowledgeFindingTool),
  write('assign_finding', 'Assign finding', 'Assign an operational finding to a role and/or team.', 'analytics', 'VIA', 'Exact finding ID, expected version, assignee', assignFindingTool),
  write('create_action_plan', 'Create action plan', 'Create a lightweight action-plan item for an operational finding.', 'analytics', 'VIA', 'Exact finding ID, expected version, description', createActionPlanTool),
  write('close_finding', 'Resolve or dismiss finding', 'Resolve or dismiss an operational finding, with an optional dismissal reason.', 'analytics', 'VIA', 'Exact finding ID, expected version, action', closeFindingTool),
];

function roleCanUse(role: Role, requiredRole: Role): boolean {
  return role === 'director' || requiredRole === 'admin';
}

function summarizeInput(input: string): { fields: string[]; itemCount?: number } {
  try {
    const parsed: unknown = JSON.parse(input);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { fields: [] };
    const value = parsed as Record<string, unknown>;
    return { fields: Object.keys(value).sort().slice(0, 20), ...(Array.isArray(value.items) ? { itemCount: value.items.length } : {}) };
  } catch { return { fields: [] }; }
}

function classifyError(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message.includes('ambiguous')) return 'AMBIGUOUS_MATCH';
  if (message.includes('not found')) return 'NOT_FOUND';
  if (message.includes('validation') || message.includes('invalid')) return 'VALIDATION_FAILED';
  if (message.includes('permission') || message.includes('unauthorized')) return 'PERMISSION_DENIED';
  if (message.includes('rate limit') || message.includes('429')) return 'RATE_LIMITED';
  if (message.includes('timeout')) return 'TIMEOUT';
  if (message.includes('zoho') || message.includes('unavailable')) return 'ZOHO_UNAVAILABLE';
  return 'INTERNAL_ERROR';
}

function limits() {
  return {
    maxToolCalls: Math.max(1, Math.min(12, Number(process.env.JARVIS_MAX_TOOL_CALLS) || 6)),
    maxIdenticalCalls: Math.max(1, Math.min(3, Number(process.env.JARVIS_MAX_IDENTICAL_TOOL_CALLS) || 1)),
    maxExecutionMs: Math.max(5_000, Math.min(55_000, Number(process.env.JARVIS_MAX_EXECUTION_MS) || 45_000)),
  };
}

function audit(context: JarvisRunContext | undefined, event: JarvisToolAuditEvent): void {
  context?.toolAudit.push(event);
  // Cloud Run retains this trace without logging customer names, IDs, or raw tool inputs.
  console.info('[jarvis.tool]', JSON.stringify(event));
}

function instrument(definition: JarvisToolDefinition): AnyJarvisTool {
  const handler = definition.handler;
  return {
    ...handler,
    async invoke(runContext, input, details) {
      const context = runContext.context;
      const startedAt = Date.now();
      const base = {
        tool: definition.name, category: definition.category, risk: definition.risk,
        role: context?.role || 'admin', conversationId: context?.conversationId || 'unavailable',
        requestId: context?.requestId || 'unavailable', timestamp: new Date().toISOString(), inputSummary: summarizeInput(input),
      };
      if (!context || !roleCanUse(context.role, definition.requiredRole)) {
        audit(context, { ...base, success: false, durationMs: Date.now() - startedAt, errorCode: 'INSUFFICIENT_PERMISSION' });
        return { error: { code: 'INSUFFICIENT_PERMISSION', message: 'You do not have permission to use this VIA capability.', retryable: false } };
      }
      const decision = authorizeJarvisAction({ identity: context.security, tool: definition });
      recordJarvisSecurityEvent(context.securityEvents, {
        timestamp: base.timestamp, requestId: base.requestId, conversationId: base.conversationId,
        event: 'authorization_decision', code: decision.code, subject: definition.name, allowed: decision.allowed,
      });
      if (!decision.allowed) {
        audit(context, { ...base, success: false, durationMs: Date.now() - startedAt, errorCode: decision.code });
        return { error: { code: decision.code, message: decision.message, retryable: false } };
      }
      const configuredLimits = limits();
      const signature = `${definition.name}:${input}`;
      const identicalCalls = context.toolSignatures.get(signature) || 0;
      if (context.toolAudit.length >= configuredLimits.maxToolCalls) {
        audit(context, { ...base, success: false, durationMs: Date.now() - startedAt, errorCode: 'TOOL_CALL_LIMIT_REACHED' });
        return { error: { code: 'TOOL_CALL_LIMIT_REACHED', message: 'JARVIS reached its safe investigation limit and will answer with the verified evidence already gathered.', retryable: false } };
      }
      if (identicalCalls >= configuredLimits.maxIdenticalCalls) {
        audit(context, { ...base, success: false, durationMs: Date.now() - startedAt, errorCode: 'DUPLICATE_TOOL_CALL_BLOCKED' });
        return { error: { code: 'DUPLICATE_TOOL_CALL_BLOCKED', message: 'JARVIS already checked this exact request. It will not repeat the same lookup without new information.', retryable: false } };
      }
      if (Date.now() - new Date(context.orchestration.startedAt).getTime() >= configuredLimits.maxExecutionMs) {
        audit(context, { ...base, success: false, durationMs: Date.now() - startedAt, errorCode: 'EXECUTION_TIME_LIMIT_REACHED' });
        return { error: { code: 'EXECUTION_TIME_LIMIT_REACHED', message: 'JARVIS reached its safe execution-time limit and will answer with the verified evidence already gathered.', retryable: false } };
      }
      const dependency = definition.source.includes('Zoho') ? 'zoho' : definition.source === 'VIA' ? 'via' : 'via_zoho';
      if (!jarvisCircuitBreaker.allow(dependency)) {
        audit(context, { ...base, success: false, durationMs: Date.now() - startedAt, errorCode: 'DEPENDENCY_UNAVAILABLE' });
        return { error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'This dependency is temporarily unavailable. JARVIS will not keep retrying it during this request.', retryable: true } };
      }
      context.toolSignatures.set(signature, identicalCalls + 1);
      recordJarvisToolSelection(context.orchestration, definition.name);
      try {
        const result = await withTimeout(handler.invoke(runContext, input, details), definition.timeoutMs || 20_000, definition.name);
        jarvisCircuitBreaker.succeed(dependency);
        audit(context, { ...base, success: true, durationMs: Date.now() - startedAt });
        return result;
      } catch (error) {
        const failure = classifyJarvisFailure(error);
        if (failure.retryable) jarvisCircuitBreaker.fail(dependency);
        const code = failure.code === 'VALIDATION' ? classifyError(error) : failure.code;
        audit(context, { ...base, success: false, durationMs: Date.now() - startedAt, errorCode: code });
        return { error: { code, message: 'VIA could not verify this information right now. No business record was changed.', retryable: failure.retryable } };
      }
    },
  };
}

export const JARVIS_TOOL_REGISTRY: JarvisToolDefinition[] = definitions.map(definition => ({ ...definition, handler: instrument(definition) }));

export function getJarvisToolsForRole(role: Role): AnyJarvisTool[] {
  return JARVIS_TOOL_REGISTRY.filter(tool => tool.status !== 'future' && roleCanUse(role, tool.requiredRole)).map(tool => tool.handler);
}

/** Return only role-authorized tools chosen by the deterministic context builder. */
export function getJarvisToolsForNames(role: Role, names: readonly string[]): AnyJarvisTool[] {
  const allowedNames = new Set(names);
  return JARVIS_TOOL_REGISTRY
    .filter(tool => allowedNames.has(tool.name) && tool.status !== 'future' && roleCanUse(role, tool.requiredRole))
    .map(tool => tool.handler);
}

export function getJarvisToolDefinition(name: string): JarvisToolDefinition | undefined {
  return JARVIS_TOOL_REGISTRY.find(tool => tool.name === name);
}

export function getJarvisToolCatalog(role: Role): Omit<JarvisToolDefinition, 'handler'>[] {
  return JARVIS_TOOL_REGISTRY.filter(tool => roleCanUse(role, tool.requiredRole)).map(({ handler: _handler, ...tool }) => tool);
}

export const JARVIS_READ_TOOLS = getJarvisToolsForRole('director');
