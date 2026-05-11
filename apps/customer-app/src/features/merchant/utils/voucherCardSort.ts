import type { MerchantVoucher } from '@/lib/api/merchant'

/**
 * Sort + filter the merchant-profile voucher list per spec §6.3 (M4c-1).
 *
 * Sort order — lower bucket renders first:
 *   1. TL urgent (current window with < 60 min remaining)
 *   2. TL active (current window with >= 60 min remaining)
 *   3. Non-TL active (redeemable, not redeemed, not expired)
 *   4. TL outside-window (no live current window) — sorted by nextWindow.startsAt asc
 *   5. Redeemed (TL via redeemedWindow; non-TL via isRedeemedThisCycle)
 *   — Expired vouchers filtered out entirely (D4 lock: expired hidden by default).
 *
 * Stale-payload guard (Gate G owner direction):
 * Merchant-profile payloads are computed at fetch time, but the user can
 * leave the screen open while a window closes. The active/urgent buckets
 * gate on `currentWindow.endsAt > now`; if `endsAt` has passed, the
 * voucher falls through to bucket 4 regardless of `currentWindow` being
 * non-null. Prevents a stale "Active" or "Ending in" pill claiming a
 * closed window is still live.
 *
 * Pure function — consumer (MerchantProfileScreen) calls with
 * `now = new Date()` at render time.
 */

type Bucket = 1 | 2 | 3 | 4 | 5  // sort priority (lower = earlier)
const URGENT_THRESHOLD_MS = 60 * 60_000

function bucketFor(v: MerchantVoucher, now: Date): Bucket | null {
  // D4 lock: expired hidden entirely.
  if (v.expiryDate && new Date(v.expiryDate).getTime() <= now.getTime()) {
    return null
  }

  // Redeemed → bucket 5 (TL via redeemedWindow; non-TL via isRedeemedThisCycle).
  const isRedeemed = v.type === 'TIME_LIMITED'
    ? v.redeemedWindow !== null
    : v.isRedeemedThisCycle
  if (isRedeemed) return 5

  // TIME_LIMITED active/urgent gating — REQUIRES a LIVE current window.
  if (v.type === 'TIME_LIMITED') {
    if (v.currentWindow) {
      const remaining = new Date(v.currentWindow.endsAt).getTime() - now.getTime()
      if (remaining > 0) {
        return remaining < URGENT_THRESHOLD_MS ? 1 : 2
      }
      // Stale: currentWindow.endsAt is in the past (user left the screen
      // open past close). Fall through to outside-window bucket so the
      // card doesn't surface a "still live" pill.
    }
    return 4  // outside-window (or degenerate: stale + no nextWindow)
  }

  // Non-TL active redeemable.
  return 3
}

export function sortMerchantVouchers(
  vouchers: MerchantVoucher[],
  now: Date = new Date(),
): MerchantVoucher[] {
  const withBuckets = vouchers
    .map(v => ({ v, bucket: bucketFor(v, now) }))
    .filter((x): x is { v: MerchantVoucher; bucket: Bucket } => x.bucket !== null)

  withBuckets.sort((a, b) => {
    if (a.bucket !== b.bucket) return a.bucket - b.bucket
    // Within bucket 4 (TL outside-window): sort by nextWindow.startsAt asc.
    // Tie-break stable for the other buckets (Array.prototype.sort is stable
    // since ES2019 — same input order is preserved within a bucket).
    if (a.bucket === 4 && a.v.nextWindow && b.v.nextWindow) {
      return new Date(a.v.nextWindow.startsAt).getTime() - new Date(b.v.nextWindow.startsAt).getTime()
    }
    return 0
  })

  return withBuckets.map(x => x.v)
}
