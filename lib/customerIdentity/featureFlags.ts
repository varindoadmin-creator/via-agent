// ─── Phase 6 feature flags ────────────────────────────────────────────────────
// Brief section 80: staged rollout, all off by default (same env-var-gated
// convention as JARVIS_FEEDBACK_SCHEMA_ENABLED/JARVIS_RELIABILITY_SCHEMA_ENABLED
// elsewhere in this codebase). Scope simplification (documented in the Phase 6
// report): QUOTATION_PREP_ENABLED/SALES_ORDER_PREP_ENABLED are declared for a
// future finer-grained rollout, but this pass's code checks the single
// COMMERCIAL_DRAFT_ENABLED master switch for draft creation; similarly
// SALES_ORDER_EXECUTION_ENABLED gates both Sales Order and Estimate execution
// rather than having a separate quotation-execution flag.

function flag(name: string): boolean {
  return process.env[name] === 'true';
}

export const isCustomerIdentityMappingEnabled = () => flag('CUSTOMER_IDENTITY_MAPPING_ENABLED');
export const isNewCustomerOnboardingEnabled = () => flag('NEW_CUSTOMER_ONBOARDING_ENABLED');
export const isZohoCustomerCreationEnabled = () => flag('ZOHO_CUSTOMER_CREATION_ENABLED');
export const isWatiContactSyncEnabled = () => flag('WATI_CONTACT_SYNC_ENABLED');
export const isCommercialDraftEnabled = () => flag('COMMERCIAL_DRAFT_ENABLED');
export const isSalesOrderExecutionEnabled = () => flag('SALES_ORDER_EXECUTION_ENABLED');

// Phase 7 (brief section 76) — customer self-service, staged rollout, all off by default.
export const isCustomerOrderStatusEnabled = () => flag('CUSTOMER_ORDER_STATUS_ENABLED');
export const isCustomerInvoiceStatusEnabled = () => flag('CUSTOMER_INVOICE_STATUS_ENABLED');
export const isCustomerInvoiceDocumentEnabled = () => flag('CUSTOMER_INVOICE_DOCUMENT_ENABLED');
export const isCustomerPaymentStatusEnabled = () => flag('CUSTOMER_PAYMENT_STATUS_ENABLED');
export const isCustomerReceivableSummaryEnabled = () => flag('CUSTOMER_RECEIVABLE_SUMMARY_ENABLED');
export const isCustomerDeliveryStatusEnabled = () => flag('CUSTOMER_DELIVERY_STATUS_ENABLED');

// Phase 8 (brief section 78) — human handoff / customer service operations, staged rollout, all off by default.
export const isCustomerServiceHandoffEnabled = () => flag('CUSTOMER_SERVICE_HANDOFF_ENABLED');
export const isAutoAssignmentEnabled = () => flag('AUTO_ASSIGNMENT_ENABLED');
export const isCustomerServiceSlaEnabled = () => flag('CUSTOMER_SERVICE_SLA_ENABLED');
export const isSlaEscalationEnabled = () => flag('SLA_ESCALATION_ENABLED');
export const isJarvisAdminCopilotEnabled = () => flag('JARVIS_ADMIN_COPILOT_ENABLED');
export const isSuggestedRepliesEnabled = () => flag('SUGGESTED_REPLIES_ENABLED');
export const isAutoReturnToViaEnabled = () => flag('AUTO_RETURN_TO_VIA_ENABLED');
/** Declared per the brief's own flag list, but its code path is a documented no-op — no verified WATI operator/assignment API exists in this codebase (see docs/customer-service-operations.md). */
export const isWatiAssignmentSyncEnabled = () => flag('WATI_ASSIGNMENT_SYNC_ENABLED');

// Phase 9 (brief section 106) — customer service / sales / marketing analytics, staged rollout, all off by default.
export const isAnalyticsEventPipelineEnabled = () => flag('ANALYTICS_EVENT_PIPELINE_ENABLED');
export const isCustomerServiceAnalyticsEnabled = () => flag('CUSTOMER_SERVICE_ANALYTICS_ENABLED');
export const isCommercialFunnelAnalyticsEnabled = () => flag('COMMERCIAL_FUNNEL_ANALYTICS_ENABLED');
export const isStockAnalyticsEnabled = () => flag('STOCK_ANALYTICS_ENABLED');
export const isSourceAttributionAnalyticsEnabled = () => flag('SOURCE_ATTRIBUTION_ANALYTICS_ENABLED');
export const isJarvisManagementAnalyticsEnabled = () => flag('JARVIS_MANAGEMENT_ANALYTICS_ENABLED');
export const isAnomalyDetectionEnabled = () => flag('ANOMALY_DETECTION_ENABLED');
export const isManagementRecommendationsEnabled = () => flag('MANAGEMENT_RECOMMENDATIONS_ENABLED');

// Phase 10 (brief section 121) — proactive operational excellence, staged rollout, all off by default.
export const isOperationalDetectionEnabled = () => flag('OPERATIONAL_DETECTION_ENABLED');
export const isOperationalFindingsUiEnabled = () => flag('OPERATIONAL_FINDINGS_UI_ENABLED');
export const isProactiveJarvisBriefEnabled = () => flag('PROACTIVE_JARVIS_BRIEF_ENABLED');
export const isManagementAlertsEnabled = () => flag('MANAGEMENT_ALERTS_ENABLED');
export const isOpportunityDetectionEnabled = () => flag('OPPORTUNITY_DETECTION_ENABLED');
export const isActionPlansEnabled = () => flag('ACTION_PLANS_ENABLED');
export const isAutoFindingResolutionEnabled = () => flag('AUTO_FINDING_RESOLUTION_ENABLED');

// Phase 11 — proactive customer & sales automation, staged rollout, all off by
// default. Commercial/dormant/reorder auto-outreach is deliberately never
// unlocked by a single flag alone — see lib/proactiveActions/approvalPolicy.ts.
export const isProactiveActionsEnabled = () => flag('PROACTIVE_ACTIONS_ENABLED');
export const isQuotationFollowupEnabled = () => flag('QUOTATION_FOLLOWUP_ENABLED');
export const isReorderOpportunitiesEnabled = () => flag('REORDER_OPPORTUNITIES_ENABLED');
export const isSampleFollowupEnabled = () => flag('SAMPLE_FOLLOWUP_ENABLED');
export const isDormantCustomerEnabled = () => flag('DORMANT_CUSTOMER_ENABLED');
export const isAutoServiceFollowupEnabled = () => flag('AUTO_SERVICE_FOLLOWUP_ENABLED');
export const isAutoCommercialOutreachEnabled = () => flag('AUTO_COMMERCIAL_OUTREACH_ENABLED');

// Phase 12 — BI & decision engineering. The Jarvis tools themselves are
// already role-gated (director-only, same as every other analytics tool);
// this one flag only controls whether the dashboard shows the additional
// Phase 12 sections, staged rollout same as Phase 9's dashboard flags.
export const isManagementDecisionEngineUiEnabled = () => flag('MANAGEMENT_DECISION_ENGINE_UI_ENABLED');

// Phase 13 — production reliability, model routing cost observability, and
// gradual customer-facing rollout. Staged rollout, all off by default; apply
// supabase/jarvis_model_usage_log.sql before enabling the first one.
export const isJarvisModelUsageLogEnabled = () => flag('JARVIS_MODEL_USAGE_LOG_ENABLED');

// Phase 14 (brief section 81) — conversation UX / human-like Jarvis, staged
// rollout. Most of this phase's fixes (the silent-failure fallback, the
// bot-identity response) are safety nets or narrow additions with no
// meaningful regression surface, so they ship unconditionally rather than
// being hidden behind a flag a operator might forget to flip. Only the one
// change to already-live, long-tested wording (dropping the repeated
// "terima kasih" opener — see responseDecision.ts's isReturningConversation)
// is gated, matching the brief's own staged-rollout intent (section 82).
/** Kill switch for the greeting-repetition fix (brief section 43) — off by default; pipeline.ts only computes/passes isReturningConversation when this is true. */
export const isContextualGreetingEnabled = () => flag('INTENT_CONTEXTUAL_GREETING');
/** Declared per the brief's flag list; not wired to any code yet — see docs/conversation-ux.md's "deliberately deferred" section for what a real implementation would need (message-burst coalescing has no safe implementation without a queue this codebase deliberately doesn't have — see docs/reliability.md). */
export const isMessageDebounceEnabled = () => flag('MESSAGE_DEBOUNCE');
/** Declared per the brief's flag list; not wired to any code yet — see docs/conversation-ux.md (only the existing stock+price combo intent is implemented; a general multi-intent composer is deferred). */
export const isMultiIntentEnabled = () => flag('MULTI_INTENT');
/** Declared per the brief's flag list; not wired to any code yet — see docs/context-management.md (conversation summarization beyond the existing carried-product-code/brand lookback is deferred). */
export const isContextSummarizationEnabled = () => flag('CONTEXT_SUMMARIZATION');
/** Declared per the brief's flag list; not wired to any code yet — see docs/conversation-ux.md (clarification wording is already candidate-specific where a resolvable ambiguity exists; a broader "always list candidates" rework is deferred). */
export const isNaturalClarificationEnabled = () => flag('NATURAL_CLARIFICATION');
/** Master flag for this phase's staged rollout (brief section 82) — declared for symmetry with every other phase's master switch; today nothing checks it directly since each individual change above already has its own narrower gate or ships unconditionally. */
export const isConversationUxV2Enabled = () => flag('CONVERSATION_UX_V2');

// Phase 15 (2026-09-02) — image-based product identification. Off by default,
// same staged-rollout convention as every other customer-facing automation
// flag above; gates lib/integrations/wati/imageAnalysis.ts's vision call in
// pipeline.ts. Before this, any inbound image was recorded but silently
// ignored (NON_TEXT_UNHANDLED) — no reply, no signal to staff either.
export const isImageProductAnalysisEnabled = () => flag('IMAGE_PRODUCT_ANALYSIS_ENABLED');
