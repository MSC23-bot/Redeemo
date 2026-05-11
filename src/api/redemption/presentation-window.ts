/**
 * M3 §AE — Redemption presentation window.
 *
 * After a customer redeems a voucher, the live "show this to staff"
 * surface (QR + 8-char code + animated trust signals) stays live for a
 * fixed 2-hour window starting at `redeemedAt`. After the window closes
 * — OR once staff has validated — the Voucher Detail screen hides the
 * code surface and falls back to the persisted-record / history view.
 *
 * This constant is the canonical backend mirror of the customer-app's
 * locked frontend constant at:
 *   apps/customer-app/src/features/voucher/utils/presentationWindow.ts
 *
 * It is voucher-type-agnostic — every redemption gets the same 2h
 * window. REUSABLE simply uses it as the gate for `lastRedemption`
 * payload exposure (spec §6.3 two-clocks independence lock + §7.1
 * state 4), whereas cycle vouchers + TIME_LIMITED keep their existing
 * cycle-gated lastRedemption semantics for return-visit history.
 *
 * Spec: docs/superpowers/specs/2026-04-17-voucher-detail-redemption-design.md §7.7, §8.10
 *       docs/superpowers/specs/2026-05-12-reusable-voucher-design.md §6.1, §6.3, §7.1
 */
export const PRESENTATION_WINDOW_MS = 2 * 60 * 60 * 1000 // 2 hours
