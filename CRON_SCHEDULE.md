# Production cron schedule

The jobs are triggered externally (Hostinger hPanel or cron-job.org), not by
repository configuration. Do not schedule the Zoho-heavy jobs at the same
minute: they share one organization-wide Zoho API rate limit.

All times below are `Asia/Jakarta`. Every request must use `POST` and include
the header `x-cron-secret: <CRON_SECRET>`.

| Time | Endpoint | Body |
|---|---|---|
| 09:00 | `/api/shipments/auto-invoice` | `{}` |
| 09:05 | `/api/customers/auto-repair` | `{}` |
| 09:10 | `/api/invoices-page/auto-send` | `{}` |
| 09:15 | `/api/inventory/price-lists/sync` | `{"dry_run":false}` |
| 09:20 | `/api/salesperson-map/sync` | `{"mode":"incremental"}` |
| 09:25 | `/api/shipments/aging-check` | `{}` |
| 09:30 | `/api/data-quality` | `{}` |
| 15:00 | `/api/salesorders/purchase-gap-check` | `{}` |

The application records every completed or failed invocation in
`public.cron_run_log`, including successful runs that find no work. Apply
`supabase/cron_run_log.sql` before relying on these heartbeats.
