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
