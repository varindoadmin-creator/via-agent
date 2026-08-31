// ─── Operational detection engine ─────────────────────────────────────────────
// VIA Customer Operations Phase 10, brief section 2, 114, 118-120: the single
// orchestrator. Deterministic end to end — no LLM call decides whether a
// finding exists, what its severity is, or whether an alert fires. Jarvis
// only explains/recommends on top of what this engine already persisted
// (brief section 114).

import { resolveTimeGrain, previousPeriod } from '../analytics/periods.ts';
import { scoreSeverity, scoreUrgency } from './severity.ts';
import { hasPersisted, hasRecovered, minimumSampleSize, defaultPersistenceWindows } from './samplingGuards.ts';
import { upsertFinding, recordNormalPass, getFindingByDedupeKey, markAlerted, type FindingWriteInput } from './findingStore.ts';
import { getDetectionRule, type DetectionRule } from './detectionRules.ts';
import { sendMail } from '../email/sendMail.ts';
import { isManagementAlertsEnabled, isAutoFindingResolutionEnabled } from '../customerIdentity/featureFlags.ts';
import type { FindingCandidate, Severity, OperationalFinding } from './types.ts';

import { detectSlaDeterioration } from './rules/slaDeterioration.ts';
import { detectBacklogRisk } from './rules/backlogRisk.ts';
import { detectPendingActionAtRisk } from './rules/pendingActionAtRisk.ts';
import { detectApprovedNotExecuted } from './rules/approvedNotExecuted.ts';
import { detectVendorDeterioration } from './rules/vendorDeterioration.ts';
import { detectHighDemandLowAvailability } from './rules/highDemandLowAvailability.ts';
import { detectConversionDecline } from './rules/conversionDecline.ts';
import { detectPricingIssues } from './rules/pricingIssues.ts';
import { detectAutomationCapabilityGap } from './rules/automationCapabilityGap.ts';
import { detectZohoWriteFailures } from './rules/zohoWriteFailures.ts';
import { detectWatiSyncHealth } from './rules/watiSyncHealth.ts';
import { detectWorkflowStuck } from './rules/workflowStuck.ts';
import { detectOnboardingFriction } from './rules/onboardingFriction.ts';
import { detectDataQualityGaps } from './rules/dataQualityGaps.ts';
import { detectHumanHandoffSpike } from './rules/humanHandoffSpike.ts';
import { detectQuotationFollowUp } from './rules/quotationFollowUp.ts';

// Static dedupe keys used by every single-instance rule (i.e. rules that
// produce at most one finding, not one per vendor/product/reason) — used to
// call recordNormalPass when the rule currently reports no candidate, so an
// already-open finding's recovery counter still advances toward
// auto-resolution. Per-entity rules (vendor/product/handoff-reason/data
// quality metric) are a documented limitation this pass: they still resolve
// correctly when the SAME entity breaches again (upsertFinding's recurrence
// path), but do not auto-recover via recordNormalPass — resolving those
// requires an explicit human action unless re-detected. See
// docs/detection-rules.md.
const SINGLE_INSTANCE_KEYS = [
  'CUSTOMER_SERVICE_SLA_DETERIORATION', 'CUSTOMER_SERVICE_BACKLOG_RISK', 'PENDING_ACTION_AT_RISK',
  'APPROVED_TRANSACTION_NOT_EXECUTED', 'CONVERSION_DECLINE', 'PRICING_COVERAGE_GAP', 'PRICING_SOURCE_CONFLICT',
  'ZOHO_WRITE_FAILURES', 'WATI_CONTACT_SYNC_HEALTH', 'WORKFLOW_STUCK', 'CUSTOMER_ONBOARDING_FRICTION',
  'HUMAN_HANDOFF_SPIKE', 'QUOTATION_FOLLOW_UP_OPPORTUNITY',
];

export interface DetectionRunResult {
  candidatesEvaluated: number;
  newFindings: number;
  updatedFindings: number;
  recurrences: number;
  normalPassesRecorded: number;
  autoResolved: number;
  alertsSent: number;
  candidates: FindingCandidate[]; // present on dryRun; empty on a live run since nothing needs re-reading
}

async function runAllRules(includeDailyRules: boolean): Promise<FindingCandidate[]> {
  const range = resolveTimeGrain('LAST_7_DAYS');
  const prevRange = previousPeriod(range);

  // Cheap, point-in-time rules — safe to run on every sweep invocation (brief section 67).
  const frequent = await Promise.all([
    detectBacklogRisk(),
    detectPendingActionAtRisk(),
    detectApprovedNotExecuted(),
    detectWorkflowStuck(),
  ]);

  if (!includeDailyRules) return frequent.flat();

  // Period-comparison / aggregate rules — gated to once per Jakarta calendar day by the sweep caller.
  const daily = await Promise.all([
    detectSlaDeterioration(range, prevRange),
    detectVendorDeterioration(range, prevRange),
    detectHighDemandLowAvailability(range),
    detectConversionDecline(range, prevRange),
    detectPricingIssues(range),
    detectAutomationCapabilityGap(range),
    detectZohoWriteFailures(range),
    detectWatiSyncHealth(range),
    detectOnboardingFriction(range),
    detectDataQualityGaps(range),
    detectHumanHandoffSpike(range, prevRange),
    detectQuotationFollowUp(),
  ]);

  return [...frequent.flat(), ...daily.flat()];
}

function toSeverityUrgency(candidate: FindingCandidate, persisted: boolean): { severity: Severity; urgency: Severity } {
  const severity = scoreSeverity({ magnitude: candidate.magnitude, persisted, affectedCount: candidate.affectedCount, slaRisk: candidate.slaRisk, confidence: candidate.confidence });
  const urgency = scoreUrgency({ timeSensitive: candidate.slaRisk, severity, slaRisk: candidate.slaRisk });
  return { severity, urgency };
}

function shouldAlert(rule: DetectionRule | undefined, finding: OperationalFinding, persisted: boolean): boolean {
  if (!persisted) return false;
  if (finding.severity !== 'HIGH' && finding.severity !== 'CRITICAL') return false;
  if (!finding.lastAlertedAt) return true;
  const cooldownMs = (rule?.cooldownMinutes ?? 240) * 60_000;
  return Date.now() - new Date(finding.lastAlertedAt).getTime() >= cooldownMs;
}

/**
 * The one entry point (brief section 2/118-120): `dryRun` computes and
 * returns candidates without writing anything or sending mail (backtest
 * mode); a live run persists findings, advances recovery counters for
 * single-instance rules that currently report nothing to alert on, and —
 * when `notify` — sends one cooldown-gated summary email for newly-eligible
 * HIGH/CRITICAL findings.
 */
export async function runOperationalDetection(options: { dryRun: boolean; notify: boolean; includeDailyRules: boolean }): Promise<DetectionRunResult> {
  const candidates = await runAllRules(options.includeDailyRules);

  if (options.dryRun) {
    return { candidatesEvaluated: candidates.length, newFindings: 0, updatedFindings: 0, recurrences: 0, normalPassesRecorded: 0, autoResolved: 0, alertsSent: 0, candidates };
  }

  let newFindings = 0, updatedFindings = 0, recurrences = 0, alertsSent = 0;
  const toAlert: OperationalFinding[] = [];
  const breachingKeys = new Set<string>();

  for (const candidate of candidates) {
    breachingKeys.add(candidate.dedupeKey);
    const ruleConfig = getDetectionRule(candidate.type);
    const existing = await getFindingByDedupeKey(candidate.dedupeKey);
    const projectedBreachCount = existing && existing.status !== 'RESOLVED' && existing.status !== 'DISMISSED' && existing.status !== 'EXPIRED'
      ? existing.consecutiveBreachCount + 1 : 1;
    const persisted = hasPersisted(projectedBreachCount, ruleConfig?.persistenceWindows ?? defaultPersistenceWindows());
    const { severity, urgency } = toSeverityUrgency(candidate, persisted);

    const writeInput: FindingWriteInput = { ...candidate, severity, urgency };
    const { finding, isNew, isRecurrence } = await upsertFinding(writeInput);
    if (isNew) newFindings++; else if (isRecurrence) recurrences++; else updatedFindings++;

    if (options.notify && isManagementAlertsEnabled() && shouldAlert(ruleConfig, finding, persisted)) {
      toAlert.push(finding);
    }
  }

  let normalPassesRecorded = 0, autoResolved = 0;
  for (const key of SINGLE_INSTANCE_KEYS) {
    if (breachingKeys.has(key)) continue;
    const ruleConfig = getDetectionRule(key);
    const result = await recordNormalPass(key, null, isAutoFindingResolutionEnabled(), ruleConfig?.persistenceWindows ?? defaultPersistenceWindows());
    if (result) {
      normalPassesRecorded++;
      if (result.status === 'RESOLVED') autoResolved++;
    }
  }

  if (toAlert.length > 0) {
    await sendAlertSummary(toAlert);
    for (const finding of toAlert) await markAlerted(finding.id);
    alertsSent = toAlert.length;
  }

  return { candidatesEvaluated: candidates.length, newFindings, updatedFindings, recurrences, normalPassesRecorded, autoResolved, alertsSent, candidates: [] };
}

const ALERT_TO = process.env.VIA_ALERT_EMAIL || 'varindo.admin@gmail.com';

async function sendAlertSummary(findings: OperationalFinding[]): Promise<void> {
  const rows = findings.map(f => `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e5e5">${f.severity}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e5e5">${f.title}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e5e5">${f.category}</td>
    </tr>`).join('');
  const html = `<p>${findings.length} operational finding${findings.length === 1 ? '' : 's'} require attention:</p>
    <table style="border-collapse:collapse;width:100%;max-width:640px">
      <thead><tr style="background:#f5f5f5;text-align:left;font-size:12px;text-transform:uppercase;color:#666"><th style="padding:6px 10px">Severity</th><th style="padding:6px 10px">Finding</th><th style="padding:6px 10px">Category</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="margin-top:16px"><a href="https://via-601025884976.asia-southeast2.run.app/requests/wati/operational-intelligence">Open Operational Intelligence in VIA →</a></p>`;
  await sendMail({ to: ALERT_TO, subject: `VIA Alert: ${findings.length} operational finding${findings.length === 1 ? '' : 's'} need attention`, html });
}
