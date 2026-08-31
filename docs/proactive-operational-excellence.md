# VIA Customer Operations — Phase 10 (Proactive Operational Excellence, Management Alerts, Opportunity Detection & Action Recommendations)

## The core loop

```text
Phase 9 Governed Metrics / Events
        ↓
Deterministic Detection (lib/operationalIntelligence/rules/*.ts)
        ↓
Structured Finding (operational_findings, deduplicated in place)
        ↓
Priority Score (lib/operationalIntelligence/priorityService.ts)
        ↓
Jarvis Explanation (internal tools — narrates/recommends, never decides)
        ↓
Human Decision (Acknowledge / Assign / Action Plan / Resolve / Dismiss)
        ↓
Outcome Tracking (before/after, "post-action change")
```

**The one rule that shaped every design decision in this phase**: the LLM never determines whether an alert fires, what its severity is, or whether a finding exists. Every one of those is a plain function over governed metrics (`lib/operationalIntelligence/severity.ts`, `detectionRules.ts`'s `evaluateThreshold`). Jarvis is only ever handed an already-computed, already-persisted finding and asked to narrate, prioritize-explain, or recommend on top of it — the same "deterministic code decides, the model explains" split Phase 9 already established for its bottleneck analysis, now applied end to end.

## Why one additive layer, not a rebuild

Phase 9 already built a governed metric layer with safe period comparison, small-sample flagging, and a FACT/DIAGNOSIS/RECOMMENDATION bottleneck function. Phase 10 does not recompute any of that. Every detection rule in `lib/operationalIntelligence/rules/` calls a Phase 9 metric function (`getCustomerServiceFunnel`, `getVendorPerformance`, `getCommercialFunnel`, `getHandoffReasonBreakdown`, `getOnboardingFunnel`, `getDataQualityCoverage`) or reads one of a handful of narrowly-scoped existing tables directly (`wati_conversation_state`, `commercial_drafts`, `commercial_approvals`, `wati_contact_sync_log`, `stock_inquiries`) for the handful of point-in-time/stuck-state facts Phase 9 never needed to compute. The only new table is `operational_findings` (plus its audit trail and lightweight action-plan table) — a durable, deduplicated record of what the detection engine already decided, not a second event stream.

## What's genuinely new vs. reused

**Reused directly**: `lib/analytics/*` (every metric), `lib/customerService/sla.ts`'s `computeCaseSlaStatus`, `lib/email/sendMail.ts`, the `app/api/wati/*/sweep` cron pattern (three existing sweeps before this phase), `cron_run_log` (for daily-cadence gating), `lib/jarvis/tools/registry.ts`'s internal-only tool pattern, `lib/jarvis/security/policy.ts`'s permission model.

**New this phase**: `operational_findings`/`operational_finding_events`/`operational_actions` tables; `lib/operationalIntelligence/` (types, severity/urgency scoring, sampling/persistence guards, baseline selection, the 14 detection rules, the detection engine, priority service, proactive brief, outcome tracking); `app/api/wati/operational/sweep`; the `/requests/wati/operational-intelligence` admin page and its API routes; 8 new internal Jarvis tools; a small dashboard widget.

## Known limitations (documented, not silently dropped)

- **Website price mismatch** (brief §18/106) — Phase 5 only logs a mismatch via `console.info`; there is no persistence table to detect against (the same gap Phase 9 already documented for its own dashboard).
- **Outbound WATI send failures / webhook ingestion health / document send failures** (brief §29, §30, §63, §65) — `sendWatiText` returns a transient result that is never durably logged today. Building that log is a genuinely separate small feature, not a detection rule.
- **Source performance deterioration** (brief §14) — built, but expected to self-suppress into LOW confidence under VIA's current attribution coverage, per the brief's own §70 instruction.
- **A database-backed, admin-editable detection-rule configuration UI** (brief §87-88) — thresholds are env-var-configured this pass, shaped exactly like the brief's `DetectionRule` interface so a future config table is additive, not a rewrite.
- **Per-entity auto-resolution** (vendor/product/handoff-reason/data-quality-metric findings) — these still resolve correctly when the *same* entity breaches again (the recurrence path), but do not auto-recover toward RESOLVED the way single-instance findings do; resolving them today requires an explicit human action. See `docs/detection-rules.md`.
- **A full ranked "manual-touch hotspot" / "cycle-time hotspot" dashboard** (brief §99-100) — the underlying numbers already exist (Phase 9's waiting-time breakdown, handoff-reason breakdown) and are reused inside finding evidence, but a dedicated ranked view is not built this pass.

## Feature flags and rollout stage

All 7 new flags (`OPERATIONAL_DETECTION_ENABLED`, `OPERATIONAL_FINDINGS_UI_ENABLED`, `PROACTIVE_JARVIS_BRIEF_ENABLED`, `MANAGEMENT_ALERTS_ENABLED`, `OPPORTUNITY_DETECTION_ENABLED`, `ACTION_PLANS_ENABLED`, `AUTO_FINDING_RESOLUTION_ENABLED`) ship **off by default**, per the brief's own recommended staged rollout (§122): with everything off, this is Stage 1 (detection code exists but does not run) — turning on `OPERATIONAL_DETECTION_ENABLED` alone starts persisting findings with no alerts (Stage 1's "shadow/dry-run" intent, made durable rather than throwaway); adding `OPERATIONAL_FINDINGS_UI_ENABLED` surfaces Stage 2's dashboard; `PROACTIVE_JARVIS_BRIEF_ENABLED` and `MANAGEMENT_ALERTS_ENABLED` are Stage 3-4; `ACTION_PLANS_ENABLED` and `OPPORTUNITY_DETECTION_ENABLED` are Stage 5-6. Outcome tracking (Stage 7) works automatically once findings resolve — no separate flag.

## Backtesting before enabling alerts

`POST /api/requests/wati/operational-findings/backtest` (session-gated, used by the admin page's "Backtest" button) runs `runOperationalDetection({ dryRun: true })` against current live data — every rule evaluated, nothing written, no mail sent — and reports which rule types currently breach and at what magnitude. Run this before turning on `MANAGEMENT_ALERTS_ENABLED` in production.
