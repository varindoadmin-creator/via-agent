# Jarvis deployment, scalability, and continuous improvement

## Environment and release contract

Set `APP_ENV` to `development`, `test`, `staging`, or `production`. Production is the only environment in which `JARVIS_WRITES_ENABLED=true` may permit approved external writes. Development, test, and staging must use separate Zoho/Supabase credentials and cannot enable Jarvis writes.

Every release exposes non-secret metadata at `GET /api/jarvis/release` for authenticated users. Set `JARVIS_RELEASE_ID` during a controlled release. The record includes version labels for prompts, models, tools, context, memory policy, knowledge, workflows, metrics, and evaluations.

## Release gate

The `Jarvis release readiness` workflow runs type checking and a production build. It is a mandatory manual release checklist until Cloud Run deployment is automated. Before deployment, verify the exact commit passes, test a read-only question, verify `GET /api/jarvis/health`, then verify `GET /api/jarvis/release` has the intended release identifier. Deploy from a clean archived commit only. The health endpoint reports only dependency presence and non-secret release/runtime state.

## Feedback and improvement

`supabase/jarvis_continuous_improvement.sql` is additive and must be applied manually. Leave `JARVIS_FEEDBACK_SCHEMA_ENABLED` false until the table exists. The authenticated feedback endpoint stores a role, run/conversation IDs, category, release ID, and a bounded note with obvious email/phone patterns redacted. It never writes to Zoho.

Review correction and failure feedback by release ID before changing prompts, models, or tools. Use a new release ID for each controlled rollout and preserve the prior Cloud Run revision for rollback.

## Progressive delivery, scale, and recovery

Start capabilities disabled behind explicit flags. Validate with an internal read-only synthetic scenario before enabling any production write path. Canary and shadow traffic require a separately approved Cloud Run plan; do not silently expose live financial data to either.

Jarvis stays stateless in request handling. Durable state belongs in Supabase only when its schema flag is enabled. Do not add queues, caches, or workers until measured latency, concurrency, or quota data demonstrates need. Use Cloud Run metrics plus structured request logs to track failures and latency. Roll back immediately if health degrades, errors rise, or an approval/write path is affected.
