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
