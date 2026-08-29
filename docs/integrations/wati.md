# WATI webhook foundation

## Endpoint

`POST /api/integrations/wati/webhook`

Production URL:

`https://via-601025884976.asia-southeast2.run.app/api/integrations/wati/webhook`

This milestone only validates and acknowledges generic inbound JSON. It does not save a message, send a reply, call WATI, contact Zoho Books, or invoke JARVIS.

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
