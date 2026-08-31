# VIA — Payment Policy

## Approved payment destination

`lib/companyKnowledge/paymentDestination.ts`'s `getActivePaymentDestination()` returns the one `ACTIVE` approved record:

```text
Bank BCA
a/n CV. VARINDO FORMA HUTAMA
No. Rek. 7610516224
KCP Supermal Karawaci, Tangerang
```

Only an `ACTIVE` record is ever returned — an `INACTIVE`/historical destination is never shown externally, even if one is added to the underlying list later.

## Destination vs. status — never confused

| Customer question | Source |
|---|---|
| "Transfer ke mana?" | `PaymentDestination` (this module) — a static, approved fact |
| "Sudah masuk?" | Phase 7's live Zoho payment data (`lib/customerSelfService/paymentStatus.ts`) |

These are handled by two distinct WATI intents with non-overlapping keyword patterns: `PAYMENT_DESTINATION_INQUIRY` ("transfer kemana", "nomor rekening", "rekening apa/mana", "bank apa", "no rek") vs. the existing `PAYMENT_STATUS` ("sudah/udah transfer/bayar", "pembayaran...masuk/tercatat"). Confirmed via test cases that a message containing only one signal routes correctly and doesn't fall into the other intent.

## Disclosure classification

`PAYMENT_DESTINATION` is `CUSTOMER_SHAREABLE` in `lib/security/disclosure/classification.ts` — always allowed for a customer to ask, same as an approved price. It is not customer-owned data requiring identity verification (unlike order/invoice/payment *status*, which is `CUSTOMER_SCOPED`).
