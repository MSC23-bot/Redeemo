/**
 * Presentation-window gate for redeemed vouchers.
 *
 * Product rule (locked 2026-05-08, owner direction during PR #49 review):
 * The redemption code + QR + Show-to-Staff button stay visible on Voucher
 * Detail for ONLY a short window after the customer first redeems. Once that
 * window expires, the code surfaces are FULLY HIDDEN from Voucher Detail —
 * no "for your records" text, no QR, no manual code anywhere on this screen.
 *
 * Why: persisting the live code surface beyond the in-store handoff window
 * lets a customer return to the same voucher hours/days later and reuse the
 * code with another staff member. The cycle-quota gate already prevents a
 * SECOND server-side claim, but the visible code is the social-engineering
 * vector. Hiding it after the window keeps the surface honest about what
 * happened ("you redeemed this voucher; it renews on <date>") without
 * dangling a code that staff might still scan.
 *
 * Window duration is `PRESENTATION_WINDOW_MS` (2 hours). The product
 * intent is a "handoff window" — long enough to cover the realistic span
 * between tapping Redeem and physically reaching the till, generous enough
 * to forgive an interrupted journey, short enough that returning much later
 * doesn't expose the code.
 *
 * After the window expires:
 *   - Voucher Detail shows the redeemed seal + non-sensitive details
 *     (voucher title/type, merchant, branch, redeemed date/time, renewal
 *     date) but no code or Show-to-Staff entry point.
 *   - The code stays accessible only via Profile → Redemption History (full
 *     persisted-return-visit code surface deferred to a future workstream;
 *     for now Voucher Detail's expired-window copy points users there).
 *   - Screen-capture protection is released — the surface no longer carries
 *     code-grade sensitivity.
 *
 * Hook design — setTimeout-at-expiry, not polling:
 *   `usePresentationActive(redeemedAt)` re-renders ONCE at the precise
 *   boundary where the window flips closed. We compute the remaining ms
 *   from now to expiry and arm a single timer. No interval, no polling,
 *   no per-second tick. Backgrounding pauses the JS timer; on resume the
 *   timer either fires immediately if it overran or completes on time.
 *   The hook recomputes if `redeemedAt` changes (e.g. a fresh redemption
 *   replaces a stale one in the cache).
 *
 * Defensive notes:
 *   - `Number.isNaN(t)` guards against malformed ISO strings — return
 *     `false` (treat as expired / not active) rather than throwing.
 *   - `redeemedAt: null` returns `false` — there's nothing to gate.
 *   - The timer is cleared on unmount and on `redeemedAt` change.
 *
 * Cross-refs:
 *   - deferred-followups §Q1 (redeemed-state visual redesign — text-based
 *     seal ships with this; full polished stamp deferred).
 *   - deferred-followups §AE (presentation-window contract).
 *   - locked iOS framing rule (§AB): the live surfaces inside the window
 *     are the trust signal on iOS; this gate decides when those surfaces
 *     stop existing.
 */
import { useEffect, useState } from 'react'

export const PRESENTATION_WINDOW_MS = 2 * 60 * 60 * 1000 // 2 hours

/**
 * Pure helper: is the redeemed-at instant still inside the presentation
 * window relative to `now` (defaults to `Date.now()`)?
 *
 * Returns false on:
 *   - malformed ISO string (defensive — never throw on user-visible paths)
 *   - any time at or after `redeemedAt + PRESENTATION_WINDOW_MS`
 */
export function isPresentationActive(
  redeemedAt: string,
  now: number = Date.now(),
): boolean {
  const t = new Date(redeemedAt).getTime()
  if (Number.isNaN(t)) return false
  return now - t < PRESENTATION_WINDOW_MS
}

/**
 * React hook: tracks presentation-window active state for a redemption.
 *
 * Re-renders ONCE when the window flips closed (setTimeout-at-expiry).
 * Returns `false` if `redeemedAt` is null or the window has already
 * expired by mount time.
 */
export function usePresentationActive(redeemedAt: string | null): boolean {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!redeemedAt) return
    const t = new Date(redeemedAt).getTime()
    if (Number.isNaN(t)) return
    const remaining = t + PRESENTATION_WINDOW_MS - Date.now()
    if (remaining <= 0) return // already expired — no timer needed
    const id = setTimeout(() => setNow(Date.now()), remaining)
    return () => clearTimeout(id)
  }, [redeemedAt])

  if (!redeemedAt) return false
  return isPresentationActive(redeemedAt, now)
}
