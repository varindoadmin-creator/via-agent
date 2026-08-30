# VIA Customer Operations — Phase 2

WATI is the WhatsApp transport/team-inbox layer only. VIA owns customer intelligence, intent detection, product resolution, and the decision of what (if anything) to say back — see `docs/integrations/wati.md` for the endpoint contract and setup checklist.

## Architecture

```
WATI Message Received
  -> normalize (lib/integrations/wati/message.ts)
  -> idempotency gate (lib/integrations/wati/store.ts: reserveWatiMessage)
  -> customer resolution (lib/customers/phoneResolution.ts: resolveCustomerByPhone)
  -> intent detection (lib/integrations/wati/intent.ts)
     deterministic rules first; a narrow, tool-free model call
     (lib/ai/provider.ts) only for genuinely ambiguous text
  -> website format parsing (lib/integrations/wati/websiteParser.ts)
  -> product resolution (lib/integrations/wati/productResolution.ts,
     reuses lib/zoho/items.ts + lib/utils/normalizeItemCode.ts)
  -> conversation context lookback (lib/integrations/wati/context.ts)
  -> response decision (lib/integrations/wati/responseDecision.ts)
     deterministic Bahasa Indonesia templates, cases A-F
  -> stock inquiry creation (lib/integrations/wati/stockInquiries.ts)
  -> WATI outbound send (lib/integrations/wati/client.ts)
  -> resolution written back to wati_messages
```

Orchestrated in `lib/integrations/wati/pipeline.ts` (`processInboundWatiMessage`), called from `app/api/integrations/wati/webhook/route.ts`. Every step after the idempotency gate runs inside its own try/catch — a processing failure is recorded as `processing_status: 'FAILED'` on the message row, but the webhook itself always returns HTTP 200 once the payload is structurally valid.

## Files changed

- New: `lib/integrations/wati/{message,store,conversationState,intent,websiteParser,productResolution,context,responseDecision,client,stockInquiries,quantity,source,pipeline}.ts` and matching `*.test.ts` for the pure/deterministic modules plus `store.test.ts` and `context.test.ts`.
- New: `lib/customers/{phoneKey,phoneResolution}.ts` (+ `phoneKey.test.ts`), `lib/zoho/brands.ts`, `lib/redact.ts`.
- New: `supabase/{wati_messages,wati_conversation_state,stock_inquiries}.sql`.
- New: `app/api/requests/wati/route.ts`, `app/requests/wati/page.tsx`.
- Modified: `app/api/integrations/wati/webhook/route.ts` (now calls the pipeline instead of only acknowledging), `lib/customerCleanup/duplicates.ts` (imports the promoted `normalizePhoneKey`), `lib/jarvis/production/feedback.ts` (imports the promoted `redact`), `lib/zoho/createPO.ts` (imports the promoted `BRAND_VENDORS`, re-exports for existing callers), `lib/zoho/customers.ts` (`getAllCustomers` exported — was previously module-private), `components/AppShell.tsx` (nav entry for `/requests/wati`).
- `package.json`: added `test:wati-inquiry`.

No changes to Zoho data, no changes to `webhook_events`/the Meta WhatsApp path, no changes to `middleware.ts` (the new admin routes are covered by the existing `/requests` and `/api/requests` prefixes already granted to both `admin` and `director`).

## Intent detection: deterministic vs. model-based

Deterministic (`detectIntentDeterministic`, no model call): human-request phrasing, the structured website product block, stock/availability keywords (`stock`, `stok`, `ready`, `ada`), a known brand name or item-code-shaped token in the text, a pure greeting, or a bare product-mention word (`produk`, `barang`, `motif`, `jenis`, `item`) with nothing else to resolve. Everything else falls through to `classifyIntentWithModel`, which:

- Runs `detectPromptInjection` on the raw text first and skips the model call entirely (falling back to `GENERAL_INQUIRY`) if any injection signal is found.
- Wraps the text with `labelUntrustedContent` before it ever reaches a prompt.
- Calls `lib/ai/provider.ts`'s `aiCompletion` directly — **not** `lib/jarvis/runner.ts`'s `runJarvis` — because the full Jarvis agent has Zoho/write tool access that must never be reachable from untrusted customer text.
- Fails safe to `GENERAL_INQUIRY` on any parse/call error, never throwing.

## Website message parser

`lib/integrations/wati/websiteParser.ts` recognizes two patterns: the bare `"Halo Admin Varindo,"` prefix (marks `source: WEBSITE` even with no further structure), and the fully structured block (`Produk: ... / Kode: ... / Harga: Rp. ... (Termasuk PPN)`), from which it extracts `productCode`, `productName`, `displayedPrice`, and `displayedPriceIncludesTax` via targeted regexes — never a general-purpose parser. **The displayed price is customer-provided context only; it is never treated as authoritative pricing.** VIA only ever trusts its own Zoho-resolved price for anything it might quote in a later phase.

## Customer experience (response decision cases)

| Case | Trigger | Response |
|---|---|---|
| A — Greeting | Pure "Halo" | Warm greeting + numbered menu (Cek Stok / Informasi Produk / Hubungi Admin) |
| B — Brand inquiry | Known brand mentioned, no specific item resolved | Brand-specific greeting + menu, never re-asks which brand |
| C — Product resolved | Item resolves `EXACT` (from a code, or the website block) | Confirms the specific item, offers menu, never re-asks for the code |
| D — Stock check | `STOCK_CHECK` intent + item resolves `EXACT` | Acknowledges only ("kami bantu cek ketersediaan... mohon ditunggu") — **never states a quantity** — and opens a `stock_inquiries` row |
| E — Clarification | Intent needs a product but none resolves | Asks for the item code or a photo — never guesses |
| F — Human request | Explicit ask to talk to an admin | Confirms handoff, flips `wati_conversation_state` to `NEEDS_HUMAN`, suppresses further auto-replies on that conversation |
| G — Ack/route | `PRICE_INQUIRY` / `ORDER_INQUIRY` | Generic acknowledgement — never quotes a price or confirms an order |

No customer-facing text in this phase is model-generated; all seven cases are fixed Bahasa Indonesia templates, which removes hallucination risk for these responses entirely.

## Safety boundaries (still enforced, unchanged from the brief)

- No Zoho writes anywhere in this phase.
- No stock quantity, price, discount, delivery date, or order confirmation is ever sent automatically.
- Customer text never reaches a tool-enabled agent.
- Once a conversation is `NEEDS_HUMAN`/`HUMAN_ACTIVE`, VIA keeps recording messages but sends no further automated reply (except acknowledging a repeated human request).
- A WATI retry of the same message is a no-op after the first successful reservation (`UNIQUE(provider, provider_message_id)`).

## Known limitations (by design, not oversights)

- **No message coalescing/debounce.** No queue infrastructure (Cloud Tasks or similar) exists anywhere in the repo. Three rapid messages get three passes through the pipeline, not one batched turn — mitigated by the short conversation-context lookback (`lib/integrations/wati/context.ts`, 10-minute window) so a bare follow-up like "stock?" still resolves against the immediately preceding product mention, without needing to buffer/delay sends.
- **Minimal rate limiting.** `countRecentWatiMessages` rejects processing past 20 messages/phone/minute — a cheap safeguard, not a full abuse-prevention system.
- **Brand resolution is conservative.** `lib/zoho/brands.ts`'s vendor map was built for PO-routing (brand → one vendor) and is explicitly documented in-repo as not reliable in reverse (an item's `vendor_name` doesn't uniquely identify its brand for several brands). Phase 2 only uses it as a positive confirmation when an item's `vendor_name` happens to match, and otherwise relies on the customer naming the brand directly in their message — it does not invent an item-code-prefix → brand mapping that doesn't exist anywhere in VIA's data today.
- **WATI outbound endpoint and payload field names are unverified** against this account's real API/webhook data — see the setup checklist in `docs/integrations/wati.md`.
- **`mobile` field coverage in customer phone matching is best-effort** — Zoho's list-contacts response (which `resolveCustomerByPhone` uses, for caching/latency reasons) may or may not include a customer's `mobile` field the way the heavier per-contact detail endpoint does; matching degrades gracefully to `phone`-only if absent, never crashes.

## Next phase

Recommend **Customer Operations Phase 3 — Stock Inquiry Operations** next: turning `stock_inquiries` rows into an actual EDL/TAK vendor-first availability workflow, SLA tracking, and a pending-inquiry dashboard, with real stock confirmation gated behind admin approval. Do not implement Phase 3 without a separate review of that brief's own architecture first.
