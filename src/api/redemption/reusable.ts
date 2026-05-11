/**
 * REUSABLE voucher cooldown — constants and helpers.
 *
 * REUSABLE v1 is a cooldown-based reusable voucher type. Customer is
 * blocked from re-redeeming the same (userId, voucherId) until
 * effectiveCooldownSeconds has elapsed since the last redemption.
 *
 * Server-enforced minimum floor (MIN_REUSABLE_COOLDOWN_SECONDS) is the
 * non-bypassable safety net — Math.max clamps even if a bad value
 * somehow slipped past Zod validation + DB CHECK constraint. Defense
 * in depth per spec §4.4.
 *
 * Spec: docs/superpowers/specs/2026-05-12-reusable-voucher-design.md §4.5
 */

/** Platform default — 4 hours (14400s). Used when Voucher.cooldownSeconds is null. */
export const DEFAULT_REUSABLE_COOLDOWN_SECONDS = 4 * 60 * 60

/** Server-enforced minimum floor — 30 minutes (1800s). */
export const MIN_REUSABLE_COOLDOWN_SECONDS = 30 * 60

/**
 * Resolve the effective cooldown for a REUSABLE voucher.
 *
 * - null cooldownSeconds → platform default (4h)
 * - non-null → merchant value, clamped to floor at runtime
 */
export function effectiveCooldownSeconds(
  voucher: { cooldownSeconds: number | null },
): number {
  return Math.max(
    voucher.cooldownSeconds ?? DEFAULT_REUSABLE_COOLDOWN_SECONDS,
    MIN_REUSABLE_COOLDOWN_SECONDS,
  )
}

/**
 * Compute when a user becomes eligible to redeem this REUSABLE voucher again,
 * given their most recent redemption time.
 *
 * - null lastRedeemedAt → null (no prior redemption, available now)
 * - otherwise → lastRedeemedAt + effectiveCooldownSeconds
 *
 * The caller is responsible for comparing against `now` to decide whether
 * the user is currently in cooldown.
 */
export function computeAvailableAgainAt(
  lastRedeemedAt: Date | null,
  voucher: { cooldownSeconds: number | null },
): Date | null {
  if (!lastRedeemedAt) return null
  return new Date(lastRedeemedAt.getTime() + effectiveCooldownSeconds(voucher) * 1000)
}
