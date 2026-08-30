# WATI integration

## Endpoint

`POST /api/integrations/wati/webhook`

Production URL:

`https://via-601025884976.asia-southeast2.run.app/api/integrations/wati/webhook`

**Phase 2 (Customer Operations)** — as of this revision, the webhook normalizes and idempotently persists every inbound message, resolves the customer against Zoho by phone, detects intent (deterministic rules first, a narrow tool-free model call for ambiguous text), recognizes Varindo's website-generated message formats, resolves the mentioned product against the Zoho item catalogue, and sends a safe, deterministic acknowledgement/clarification reply through WATI. It never invents stock, price, or commitments — see `docs/customer-operations.md` for the full architecture, and `lib/integrations/wati/*.test.ts` for the behavioral test suite (`npm run test:wati-inquiry`).

## Security

The route is the sole WATI public-route exception in `middleware.ts`; VIA's session authentication remains required for all other protected pages and APIs.

If `WATI_WEBHOOK_SECRET` is set, the endpoint requires the exact header:

```text
Authorization: Bearer <WATI_WEBHOOK_SECRET>
```

Use this only if the WATI webhook configuration being used can send a dedicated API key in the `Authorization` header. WATI's message-event webhook documentation does not define one universal signature/header contract, so verify the configured WATI webhook with a test delivery before enabling this optional check. If the environment variable is omitted, the route accepts the provider's public test payloads. Never put a secret in source control or logs.

## Local test

Start VIA with `npm run dev`, then run:

```bash
curl -i -X POST http://localhost:3000/api/integrations/wati/webhook \
  -H 'Content-Type: application/json' \
  -d '{"eventType":"messageReceived","test":true}'
```

Expected response: `HTTP/1.1 200` with `{"ok":true,"integration":"wati"}`.

For authenticated production configuration, additionally use:

```bash
  -H 'Authorization: Bearer <WATI_WEBHOOK_SECRET>'
```

## Deploy and configure

Deploy VIA using the existing Cloud Run command. Add `WATI_WEBHOOK_SECRET` to Cloud Run Secret Manager only when you enable WATI's webhook API-key/Authorization setting. In WATI, create a **Message Received** webhook, paste the production URL above, select POST/JSON, enable it, and use the configured secret when supported.

WATI documents that webhook endpoints must be publicly reachable and acknowledge events with HTTP 2xx. Its API/webhook documentation also describes bearer-token headers for configured authentication. [WATI webhooks](https://support.wati.io/en/articles/14111740-how-to-set-up-and-use-webhooks-in-wati) · [WATI authentication](https://docs.wati.io/reference/authentication)

## Phase 2 setup checklist

Before Phase 2's processing pipeline is fully live in an environment:

1. Apply `supabase/wati_messages.sql`, `supabase/wati_conversation_state.sql`, and `supabase/stock_inquiries.sql` manually (SQL Editor) — additive, safe to re-run.
2. Set `WATI_API_TOKEN` and `WATI_API_BASE_URL` (e.g. `https://live-mt-server.wati.io/<tenantId>`) to enable outbound replies. Until set, `lib/integrations/wati/client.ts` logs and no-ops — inbound processing, storage, classification, and the admin inbox all still work.
3. The exact outbound endpoint shape (`/api/v1/sendSessionMessage/{whatsappNumber}?messageText=...`) is written against WATI's documented API but unverified against this account's real credentials — confirm against your WATI plan's actual API reference before relying on it, and adjust `client.ts` if it differs.
4. The real WATI webhook payload's exact field names (`waId`, `whatsappMessageId`, `senderName`, etc. in `lib/integrations/wati/message.ts`) are written defensively against WATI's public docs, since no real payload was captured before this revision. The full raw payload is always stored in `wati_messages.raw_payload` — inspect the first few real production rows to confirm/adjust field names if messages come through with unexpected nulls.
5. View processed inquiries at `/requests/wati` (admin/director).
