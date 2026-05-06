import type { VoucherDetail } from '@/lib/api/voucher'

/**
 * Time-limited voucher availability + countdown logic.
 *
 * **M1 LIMITATION (deferred follow-up):** the backend's voucher payload
 * does NOT currently expose `availableFrom` / `availableUntil` window
 * fields per voucher. Without those fields, states 5/6/7 (time-limited
 * available / unavailable / urgency) cannot reliably render — so this
 * hook returns a permissive "always available" stub for vouchers of
 * type TIME_LIMITED. The voucher type tag still drives a "Time-limited"
 * display badge so users see the type, but the eligibility behaves the
 * same as a regular voucher.
 *
 * **Backend dependency to surface `availableFrom` / `availableUntil`
 * (or an equivalent recurring-window structure) is required before
 * states 5/6/7 can ship.** When that lands, this hook will need:
 *   • a `now: Date` parameter for test-time injection,
 *   • a 60s `setInterval` to roll the countdown forward,
 *   • the actual time-window math.
 *
 * For M1 we keep the surface minimal and pure — no clock dependency,
 * no interval, no re-renders. Adding those back is a small change
 * scoped to this file when the backend ships its side.
 */

export type TimeLimitedState = {
  /** Is the voucher type TIME_LIMITED? Drives the "Time limited" badge. */
  isTimeLimited: boolean
  /**
   * Currently within the redemption window? In the M1 stub this is
   * always `true` for TIME_LIMITED vouchers (since we have no window
   * data); when the backend ships availableFrom/until, this flips to
   * a real time check.
   */
  isCurrentlyAvailable: boolean
  /**
   * Whether we're within the urgency threshold (e.g. <30 min remaining
   * in the current window). Always `false` in the M1 stub.
   */
  isUrgent: boolean
  /**
   * Minutes remaining in the current window (when isCurrentlyAvailable
   * is true). Null in the M1 stub.
   */
  minutesRemaining: number | null
}

export function useTimeLimited(voucher: VoucherDetail | null | undefined): TimeLimitedState {
  if (!voucher || voucher.type !== 'TIME_LIMITED') {
    return {
      isTimeLimited: false,
      isCurrentlyAvailable: true,    // non-TIME_LIMITED: just available (subject to expiry)
      isUrgent: false,
      minutesRemaining: null,
    }
  }

  // M1 stub: TIME_LIMITED voucher with no window data → treat as
  // always-available so the user can still redeem. The "Time limited"
  // badge surfaces the type without misleading the user about
  // availability. When backend adds availableFrom/until, replace this
  // block with the real window check (and add the `now` param + tick).
  return {
    isTimeLimited: true,
    isCurrentlyAvailable: true,
    isUrgent: false,
    minutesRemaining: null,
  }
}
