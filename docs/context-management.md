# VIA — Context Management (Phase 14)

## What actually carries across turns today

`lib/integrations/wati/context.ts`'s `resolveConversationContext(customerPhoneNormalized)` — the only cross-turn context mechanism in the WATI pipeline:

- Looks back the last `LOOKBACK_LIMIT` (5) messages within `LOOKBACK_MINUTES` (10) for this phone (via `fetchRecentWatiMessages` in `lib/integrations/wati/store.ts`).
- Returns the first prior message's `item_code`/`brand` it finds (`carriedProductCode`/`carriedBrand`), or both `null` if none.
- Called in `pipeline.ts` only when the current message has no product code/brand of its own (`!websiteProduct && !intentResult.productCodeCandidate`) — a message that already names a product never needs carried context.
- Fails safe: any lookup error returns empty context rather than breaking the turn (`.catch` wraps the whole function body internally).

This is genuinely narrow: it answers "what product was this conversation just talking about," and nothing else. It does **not** track:
- Quantity, address, or any other field from a prior turn (those are tracked separately, per-workflow, in `commercial_drafts`/`customer_drafts`/`stock_inquiries` — see below).
- A list of options previously shown to the customer (no "select item 2 from the list I just showed you" capability exists — see Gap 8 below).
- Anything beyond the 10-minute/5-message window.

## Gap 8 (brief section 13) — deictic phrase recognition: not extended this phase

The plan for this phase's implementing session was to extend `resolveConversationContext`'s trigger condition to also fire when the current message contains an explicit deictic phrase ("yang tadi", "itu", "yang di atas", "produk tadi") even if a product code candidate is technically absent — i.e., treat those phrases as an affirmative "yes, use the carried context" signal rather than relying solely on "no product code found at all." This was not implemented before the session ran out of time; the trigger condition in `pipeline.ts` is unchanged.

**Explicitly not attempted, and not planned for a future pass without a real design**: general anaphora resolution ("warna yang kedua" — selecting the 2nd item from a previously shown list). There is no tracked "last list of candidates shown to this customer" anywhere in this codebase. Building that would mean: persisting the candidate list somewhere per-conversation, matching an ordinal reference ("yang kedua"/"nomor 2") back to it, and handling staleness (what if the customer references "yang kedua" after three unrelated messages?). None of that exists — don't assume it does.

## Why active-workflow state survives interruptions already (brief sections 14-15)

This isn't `context.ts`'s job — it's a property of how business state is modeled elsewhere:

- A stock check lives in `stock_inquiries`, keyed by its own row, tracked independently of "what the customer's last message was about."
- A commercial draft lives in `commercial_drafts`, same story.
- Answering an unrelated side question (company info, shipping policy) doesn't touch either table — the response function for those intents is a pure, stateless lookup.

So a customer asking "ATP11358M ada stok?" then "btw alamat kantor dimana?" doesn't lose the stock check — the `stock_inquiries` row keeps advancing via its own vendor-check workflow regardless of what other messages arrive in between. **What's missing** is the proactive acknowledgment brief section 15 asks for (telling the customer "untuk ATP11358M tadi, kami masih menunggu hasil pengecekan stok" after answering the side question) — not implemented this phase; see `docs/conversation-ux.md`'s deferred list.

## Conversation summarization (brief sections 51-52) — `CONTEXT_SUMMARIZATION` flag

Declared in `lib/customerIdentity/featureFlags.ts`, no code path yet. There is nothing resembling an LLM-generated running summary of older turns anywhere in the WATI pipeline (which makes sense — the pipeline is fully deterministic, not LLM-driven, for customer-facing replies; see `docs/jarvis-language-policy.md` and `docs/conversation-ux.md` for why). If this is ever built, the non-negotiable from the original brief still applies: a summary must never replace or override an authoritative business fact (price, stock, order status) — those always come from a live service call, never from a cached/summarized understanding of what was said earlier.

## Context priority (brief section 53) — as currently implemented, not as an aspiration

The actual order `pipeline.ts` resolves things in, for what it's worth documenting honestly:

1. The current message's own text (intent classification, product-code extraction).
2. Active workflow short-circuits, checked *before* generic intent detection — a reply to VIA's own pending question (quantity follow-up, commercial-workflow follow-up, self-service follow-up) is resolved first, so "20" after "berapa yang dibutuhkan?" is never misclassified as a fresh generic message.
3. `resolveConversationContext`'s carried product/brand, only when the current message has none of its own.
4. Authoritative Zoho/Supabase facts (customer identity, product/price/stock), always fetched live, never assumed from memory.

There is no separate "trusted customer context" or "conversation summary" layer distinct from the above — this list *is* the whole priority order today.
