# VIA Deployment

The Jarvis-specific release contract (environments, `APP_ENV`, `/api/jarvis/release`, feedback/continuous-improvement schema, progressive delivery posture) is documented in `docs/jarvis-deployment-scalability-continuous-improvement.md` and is not repeated here.

## What Phase 13 adds

- **New Supabase migrations to apply before enabling their flags**: `supabase/background_jobs.sql`, `supabase/customer_outreach_suppressions.sql` (carried from Phase 11 if not already applied), `supabase/jarvis_model_usage_log.sql`.
- **New cron registration**: `app/api/jobs/sweep` — added to `middleware.ts`'s `CRON_PATHS` and to `CRON_SCHEDULE.md` (recommended: every 10 minutes; it is cheap — Supabase-only claims plus at most a handful of Zoho/WATI retries per tick).
- **New environment variables** (all optional, sensible defaults preserve current behavior):
  - `JOBS_DEAD_ALERT_THRESHOLD` (default 5) — DLQ size that triggers one bounded alert email per sweep.
  - `LOGIN_RATE_LIMIT_MAX` / `LOGIN_RATE_LIMIT_WINDOW_MS` (default 10 per 5 minutes).
  - `JARVIS_CHAT_RATE_LIMIT_MAX` / `JARVIS_CHAT_RATE_LIMIT_WINDOW_MS` (default 30 per minute).
  - `AUTO_COMMERCIAL_OUTREACH_ROLLOUT_PERCENT` (default 100 — unchanged behavior; set below 100 to stage Phase 11's automatic commercial outreach to a percentage of customers).
  - `JARVIS_MODEL_USAGE_LOG_ENABLED` (default false).

## Rollback

A rollback is a normal Cloud Run revision rollback, same as documented in `docs/jarvis-deployment-scalability-continuous-improvement.md`. If you roll back past this phase, also disable `JARVIS_MODEL_USAGE_LOG_ENABLED` before the rollback (a prior revision doesn't know about the new table, but leaving the flag off is harmless either way since the write is best-effort). The `background_jobs` and `jarvis_model_usage_log` tables are additive and safe to leave in place even if the code that reads/writes them is rolled back.

## Staged rollout for customer-facing automation

Brief section 27 asks for DEV → STAGING → CANARY → PRODUCTION stages for high-risk customer automation. VIA does not have separate staging infrastructure for the WATI-facing path (a second WATI number/webhook would be required, which is outside this phase's scope) — the closest practical equivalent already in place is Phase 11's own layered rollout (`PROACTIVE_ACTIONS_ENABLED` → per-type flags → `AUTO_COMMERCIAL_OUTREACH_ENABLED` → now also `AUTO_COMMERCIAL_OUTREACH_ROLLOUT_PERCENT`), which lets a real production canary (a percentage of real customers) substitute for a separate canary environment. This is documented as the actual practice, not a claim that a full DEV/STAGING/CANARY pipeline exists.
