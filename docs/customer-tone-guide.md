# VIA — Customer Tone Guide (Phase 14)

A reference for anyone writing a new customer-facing response string in `lib/integrations/wati/`. These rules were already implicit in the existing response functions before this phase — this doc makes them explicit so they stay consistent as new intents/responses get added.

## Indonesian (the default channel language)

- **Pak/Bu, used naturally, not on every sentence.** "Baik Pak/Bu" opens most responses once; don't repeat "Pak/Bu" a second time in the same short message.
- **"Terima kasih telah menghubungi Varindo" — once per conversation, not once per message.** See `docs/conversation-ux.md`'s greeting-repetition fix. If you're writing a new first-contact-style response, follow `greeting()`/`brandInquiry()`/`productResolved()` in `lib/integrations/wati/responseDecision.ts`: two variants, one for a genuinely first message, one for an ongoing conversation.
- **Professional, warm, concise.** Look at `stockAck()`, `clarification()`, `humanRequest()` in `responseDecision.ts` for the register: short sentences, no corporate jargon, no slang unless the business context calls for it (it never has, so far).
- **No excessive formality, no stiffness.** "Mohon ditunggu sebentar ya" (from `stockAck()`) is the right level of warmth — not "Dengan hormat, kami informasikan bahwa..."

## English

Not currently exercised by any shipped response — see `docs/jarvis-language-policy.md` for why (VIA's customer-facing pipeline is Indonesian-only today). If a genuine English-speaking customer scenario is built later: professional, concise, friendly, no corporate jargon — the same register as the Indonesian rules above, not a formal translation of them.

## Never do this

- **Never repeat the customer's name in every message.** VIA doesn't currently address customers by name in any response function — if that's added later, use it occasionally, never every message, and never guess gender from a name (brief section 9's explicit instruction).
- **Never expose internal jargon.** No response string may contain "Tier", "CommercialDraft", "CustomerChannelIdentity", "Phase 3", "POLICY_CONFLICT", "NEEDS_HUMAN", or any other internal type/enum/phase name. Every existing response function is already clean of this — grepped and confirmed during this phase's work. If you add a new response and it needs to reference an internal concept, translate it into what the customer actually experiences (e.g. "kami bantu hubungkan dengan Admin", never "conversation state transitioned to NEEDS_HUMAN").
- **Never claim a workflow step happened when it didn't.** `humanRequest()`'s "kami bantu hubungkan dengan Admin Varindo" is only ever sent from the one code path (`F_HUMAN`/`markHumanRequest: true`) that actually triggers `triggerHandoff()` in `pipeline.ts` — never say "sudah diteruskan" from a response function that isn't backed by a real state transition.
- **Never invent a price, stock level, delivery date, discount, or urgency claim.** Every number in a customer-facing message comes from an authoritative service call (Zoho pricing/stock, Phase 3's vendor-first stock workflow) — never from the template layer guessing. See `docs/jarvis-language-policy.md`'s "error and uncertainty language" section for how to phrase what VIA doesn't know yet.
- **Minimal emoji.** No shipped response uses emoji. Don't add one unless the brand voice is explicitly revisited — not this phase's call to make.

## Error and uncertainty (brief sections 41-42)

- Don't say "Zoho API failed" or any technical term. Say what `systemErrorFallback()` says: "Mohon maaf Pak/Bu, sistem kami sedang mengalami kendala untuk memproses permintaan tersebut. Kami bantu teruskan ke Admin." (`lib/integrations/wati/responseDecision.ts`) — only for a genuinely unhandled pipeline exception, never as a first-choice answer to an ordinary question.
- When VIA genuinely doesn't know something yet (not a system failure, just information that needs confirming), say so plainly rather than guessing — "Untuk informasi tersebut perlu kami konfirmasi terlebih dahulu" reads better than a wrong or fabricated answer.
