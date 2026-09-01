# VIA — Language Policy (Phase 14)

## What actually exists today

Grepped `lib/integrations/wati/intent.ts`, `responseDecision.ts`, and `pipeline.ts` for any language-detection or English-response logic: **none exists**. Every deterministic pattern in `intent.ts` is Bahasa Indonesia (with a handful of English keywords mixed in, like "stock"/"ready" in `STOCK_KEYWORD_PATTERN` — those match common Indonesian-business-WhatsApp code-switching, not a language-detection feature), and every response function in `responseDecision.ts` returns Indonesian text unconditionally, regardless of what language the inbound message was written in.

This means brief section 6's "support Bahasa Indonesia, English, and mixed Indonesian-English, respond primarily in the customer's language" is only half true in practice:

- **Mixed Indonesian-English input already works fine** — the deterministic patterns already tolerate English words inside an otherwise-Indonesian message ("ATP11358M ready?", "Mau katalog EDL"), because they were written as loose keyword/phrase matches, not a whole-sentence grammar.
- **A customer writing in pure English still gets an Indonesian reply.** There is no code path that detects "this message is English" and selects an English response variant — every response function has exactly one wording, in Indonesian.

## Why this isn't fixed this phase

Building a genuine bilingual response layer is a materially bigger feature than a gap-fill: every response function in `responseDecision.ts`, `pricing/responses.ts`, `companyKnowledge/responses.ts`, `commercial/responses.ts`, and `customerSelfService/*` would need an English variant, plus a reliable language-detection signal (the existing intent-classification model call in `classifyIntentWithModel` is narrow and tool-free — it could plausibly also return a detected language, but that's a design decision for whoever builds this, not something to bolt on inside an unrelated gap-fill pass). Attempting a partial version (English wording for only some responses) would be worse than the current honest state — a customer would get inconsistent language mid-conversation.

**Recommendation for a future phase**: if genuine English-speaking customer volume justifies it, extend `classifyIntentWithModel`'s narrow model call to also emit a `language: 'ID' | 'EN'` field (still no tool access, still fails safe to Indonesian on any classification failure), thread it through `ResponseDecisionInput` the same way this phase added `isReturningConversation`, and add an English variant to each response function one at a time, each covered by its own test — not a whole-file rewrite.

## Product codes are never translated

Confirmed by construction, not by a specific check: no response function ever transforms an item code, SKU, or brand name — they're passed through verbatim from `ZohoItem.sku`/`.name` and the fixed `LAMITAK`/`EDL` brand labels. There's no translation layer to accidentally mangle them.

## Tone rules

See `docs/customer-tone-guide.md` for Indonesian/English register rules (they'd apply identically to a future English variant — professional, concise, friendly, no corporate jargon).
