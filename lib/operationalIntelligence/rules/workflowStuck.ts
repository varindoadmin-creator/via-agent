// VIA Customer Operations Phase 10, brief section 66: WORKFLOW_STUCK — generic
// detection of records stuck in an in-flight state beyond a reasonable
// threshold. Distinct from approvedNotExecuted.ts (APPROVED/EXECUTING
// commercial drafts, which get their own higher-severity finding type) —
// this rule covers the other in-flight states the brief names: commercial
// drafts awaiting approval, and customer onboarding drafts awaiting
// approval/Zoho creation.

import { supabaseSelect } from '../../supabase/rest.ts';
import { getDetectionRule, evaluateThreshold } from '../detectionRules.ts';
import type { FindingCandidate } from '../types.ts';

function envMinutes(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

interface StatusRow { id: string; status: string; updated_at: string }

export async function detectWorkflowStuck(): Promise<FindingCandidate[]> {
  const ruleConfig = getDetectionRule('WORKFLOW_STUCK');
  if (!ruleConfig?.enabled) return [];

  const thresholdMinutes = envMinutes('OPERATIONAL_WORKFLOW_STUCK_MINUTES', 120);
  const cutoff = new Date(Date.now() - thresholdMinutes * 60_000).toISOString();

  const [stuckCommercialDrafts, stuckCustomerDrafts] = await Promise.all([
    supabaseSelect<StatusRow>('commercial_drafts', `status=eq.WAITING_FOR_APPROVAL&updated_at=lt.${cutoff}&select=id,status,updated_at&limit=200`),
    supabaseSelect<StatusRow>('customer_drafts', `status=in.(WAITING_FOR_APPROVAL,CREATING_ZOHO_CUSTOMER)&updated_at=lt.${cutoff}&select=id,status,updated_at&limit=200`),
  ]);

  const affectedCount = stuckCommercialDrafts.length + stuckCustomerDrafts.length;
  const { breaches, magnitude } = evaluateThreshold(ruleConfig, affectedCount);
  if (!breaches) return [];

  return [{
    category: 'SYSTEM_RELIABILITY', type: 'WORKFLOW_STUCK',
    title: 'Records are stuck in an in-flight workflow state',
    dedupeKey: 'WORKFLOW_STUCK',
    metricKey: 'workflow_stuck_count',
    currentValue: affectedCount, baselineValue: 0, baselineType: 'CONFIGURED_TARGET',
    evidence: [
      { metricKey: 'commercial_drafts_stuck', label: `Commercial drafts awaiting approval > ${thresholdMinutes} min`, currentValue: stuckCommercialDrafts.length },
      { metricKey: 'customer_drafts_stuck', label: `Onboarding drafts awaiting approval/creation > ${thresholdMinutes} min`, currentValue: stuckCustomerDrafts.length },
    ],
    confidence: 'HIGH',
    sampleSize: affectedCount,
    magnitude, affectedCount, slaRisk: false,
    recommendedActionType: 'ESCALATE_PENDING_CASES',
    recommendationText: 'Review these stuck drafts — each represents a customer request waiting on an internal review step that has not progressed.',
    assignedTeam: ruleConfig.ownerTeam,
    ruleVersion: 1,
  }];
}
