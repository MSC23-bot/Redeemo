import type { MerchantVoucher } from '@/lib/api/merchant'

/**
 * Sort + filter the merchant-profile voucher list per spec §6.3 (M4c-1)
 * + spec §8.3 D33 (M5 REUSABLE integration, locked 2026-05-12).
 *
 * Sort order — lower bucket renders first:
 *   1. TL urgent (current window with < 60 min remaining)
 *   2. TL active (current window with >= 60 min remaining)
 *   3. Non-TL active (redeemable, not redeemed, not expired)  ← REUSABLE-available joins here
 *   4. Soon / blocked: TL outside-window (no live current window)  ← REUSABLE-cooldown joins here
 *      — sorted by nearest-available-time:
 *        TL       → nextWindow.startsAt
 *        REUSABLE → reusableState.availableAgainAt
 *   5. Redeemed (TL via redeemedWindow; non-TL via isRedeemedThisCycle)
 *   — Expired vouchers filtered out entirely (D4 lock: expired hidden by default).
 *
 * D33 framing note: the spec §8.3 table groups REUSABLE-cooldown with TL-
 * unavailable-today AND cycle-redeemed-this-cycle in one "soon/blocked" tier.
 * The existing sort util (§6.3 baseline) puts cycle-redeemed in its own
 * terminal bucket (5) after TL outside-window (4). To preserve the locked
 * §6.3 ordering, M5 keeps cycle-redeemed in bucket 5; only TL-unavailable
 * and REUSABLE-cooldown share bucket 4. The visible-tier semantics match
 * §8.3 (actionable → soon → terminal) without collapsing the locked
 * baseline separation.
 *
 * Stale-payload guard (Gate G owner direction + M5 REUSABLE extension):
 * Merchant-profile payloads are computed at fetch time, but the user can
 * leave the screen open while a window closes. Two cases:
 *   - TL: active/urgent buckets gate on `currentWindow.endsAt > now`; if
 *     `endsAt` has passed, the voucher falls through to bucket 4.
 *   - REUSABLE: cooldown bucket gates on `availableAgainAt > now`; if
 *     `availableAgainAt` has passed, the voucher rises to bucket 3
 *     (available alongside non-TL active redeemables) — same fallthrough
 *     pattern as the pill component's State 1 guard.
 *
 * Pure function — consumer (MerchantProfileScreen) calls with
 * `now = new Date()` at render time.
 */

type Bucket = 1 | 2 | 3 | 4 | 5  // sort priority (lower = earlier)

// OWNER LOCKED Gate H 2026-05-11: TIME_LIMITED urgency threshold is 60 minutes
// product-wide (Voucher Detail `useTimeLimited` + Merchant Profile sort + pill).
// Supersedes spec §6.2's older <30 min wording. Sort bucket boundary MUST match
// the pill component's urgency classification — otherwise a card in bucket 1
// (sort-urgent) would render an "Active" pill (visible UX contradiction).
const URGENT_THRESHOLD_MS = 60 * 60_000

function bucketFor(v: MerchantVoucher, now: Date): Bucket | null {
  // D4 lock: expired hidden entirely.
  if (v.expiryDate && new Date(v.expiryDate).getTime() <= now.getTime()) {
    return null
  }

  // Redeemed → bucket 5. M5 lock: REUSABLE redeemed state uses the same
  // cycle quota convention as non-TL (`isRedeemedThisCycle`), per spec §3
  // "vouchers are the only merchant-governed surface (defined merchant-wide,
  // redeemed branch-attributed, cycle quota merchant-wide per voucher)".
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

  // M5 REUSABLE — D33 integration. Available state joins non-TL active
  // (bucket 3); cooldown state joins TL outside-window (bucket 4). The
  // stale-payload guard rises a past-availableAgainAt voucher to bucket 3
  // so the user sees "AVAILABLE NOW" on the card (matching the pill's
  // own fallthrough).
  if (v.type === 'REUSABLE') {
    const availableAgainRaw = v.reusableState?.availableAgainAt
    if (!availableAgainRaw) return 3  // null or omitted → available
    const availableAgainAtMs = new Date(availableAgainRaw).getTime()
    return availableAgainAtMs > now.getTime() ? 4 : 3
  }

  // Non-TL non-REUSABLE active redeemable.
  return 3
}

/**
 * Bucket-4 sort key (nearest-available-time). TL voucher uses
 * `nextWindow.startsAt`; REUSABLE uses `reusableState.availableAgainAt`.
 * Returns `Number.MAX_SAFE_INTEGER` for degenerate cases so degenerate
 * cards (e.g. stale TL with null nextWindow) sink to the end of the
 * bucket rather than throwing on the comparator's Date access.
 */
function bucket4SortKey(v: MerchantVoucher): number {
  if (v.type === 'TIME_LIMITED') {
    return v.nextWindow ? new Date(v.nextWindow.startsAt).getTime() : Number.MAX_SAFE_INTEGER
  }
  if (v.type === 'REUSABLE') {
    const raw = v.reusableState?.availableAgainAt
    return raw ? new Date(raw).getTime() : Number.MAX_SAFE_INTEGER
  }
  return Number.MAX_SAFE_INTEGER
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
    // Within bucket 4 (soon/blocked): sort by nearest-available-time.
    // Mixed TL + REUSABLE — the helper handles both types and degenerate
    // (no startsAt / no availableAgainAt) cards.
    // Tie-break stable for the other buckets (Array.prototype.sort is stable
    // since ES2019 — same input order is preserved within a bucket).
    if (a.bucket === 4) {
      return bucket4SortKey(a.v) - bucket4SortKey(b.v)
    }
    return 0
  })

  return withBuckets.map(x => x.v)
}
