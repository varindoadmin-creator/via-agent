# VIA — Shipping Policy

## Cutoff

14:00 WIB, Monday-Friday. `lib/companyKnowledge/shippingPolicy.ts`'s `isBeforeCutoff()` computes this in Asia/Jakarta local time using the same offset-math pattern already established in `lib/analytics/periods.ts` — never a raw UTC hour/day boundary. A weekend order is always treated as after-cutoff.

## Dispatch commitments

| | Before 14:00 WIB (Mon-Fri) | After 14:00 WIB / weekend |
|---|---|---|
| Jabodetabek | Shipped next working day, max 2 working days | Shipped within 2 working days |
| Outside Jabodetabek | Handed to logistics partner next working day, max 2 working days | Handed to logistics partner within 2 working days |

`computeDispatchCommitment()` returns dispatch/handoff-to-logistics wording only — **never an arrival date**. Jarvis must distinguish "dikirim/diserahkan ke mitra logistik" from "barang tiba" (brief §47) — the customer-facing response text is written to make this distinction explicit rather than leaving it implicit.

## Free shipping (Java)

"Gratis ongkir dan peti kayu ke seluruh wilayah Jawa tanpa minimum pembelian." `checkJavaEligibility()` determines this via a deterministic province/city allow-list (`DKI Jakarta, Jawa Barat, Jawa Tengah, Jawa Timur, Banten, Yogyakarta` plus well-known Java cities) and a matching non-Java marker list (Sumatera, Kalimantan, Sulawesi, Bali, etc.) — an ambiguous or unrecognized destination returns `UNKNOWN`, never a guess, and the customer is asked to clarify.

## Standard conditions

Delivery time may adjust for national holidays, collective leave, or operational conditions; force majeure is excluded from the commitment; areas with limited logistics access may need additional time; Varindo is not responsible for delay caused by an incomplete or inaccurate shipping address. Fixed text in `SHIPPING_CONDITIONS_TEXT`.

## Where this is served

`SHIPPING_POLICY_INQUIRY` intent (keywords: `ongkir`, `ongkos kirim`, `biaya kirim`, `gratis ongkir`, `peti kayu`, `batas jam order`, `cut off`) — deliberately distinct keywords from the existing Phase 7 `DELIVERY_STATUS` intent ("dikirim", "pengiriman", "barang saya"), so a general shipping-policy FAQ and "has my own order shipped" never collide. An ambiguous bare "kapan dikirim" continues through the existing Phase 7 self-service path unchanged — a deliberate, conservative choice to avoid regressing working behavior.
