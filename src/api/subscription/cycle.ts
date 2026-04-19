import { PrismaClient } from '../../../generated/prisma/client'

/**
 * Clamps a day-of-month to the last valid day of the target month.
 * E.g., day 31 in February → 28 (or 29 in leap year).
 * This mirrors how credit card billing anchors work.
 */
function clampedDate(year: number, month: number, day: number): Date {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return new Date(Date.UTC(year, month, Math.min(day, lastDay)))
}

/**
 * Given a subscription's cycleAnchorDate, calculate which monthly cycle
 * window the current time falls in.
 *
 * E.g., anchor = 10 April:
 *   On 23 July → cycleStart = 10 July,  cycleEnd = 10 Aug
 *   On 5 July  → cycleStart = 10 June,  cycleEnd = 10 July
 *
 * This is the single source of truth for monthly voucher cycles.
 * It is independent of billing interval (monthly/annual) and payment
 * source (Stripe, Apple IAP, Google Play, admin-grant).
 */
export function getCurrentCycleWindow(
  anchorDate: Date,
  now: Date = new Date()
): { cycleStart: Date; cycleEnd: Date } {
  const anchorDay = anchorDate.getUTCDate()

  // Try this month's anchor day
  let cycleStart = clampedDate(now.getUTCFullYear(), now.getUTCMonth(), anchorDay)

  // If we haven't reached the anchor day yet this month, the cycle started last month
  if (now < cycleStart) {
    const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
    cycleStart = clampedDate(prev.getUTCFullYear(), prev.getUTCMonth(), anchorDay)
  }

  // Cycle end is next month's anchor day
  const next = new Date(Date.UTC(cycleStart.getUTCFullYear(), cycleStart.getUTCMonth() + 1, 1))
  const cycleEnd = clampedDate(next.getUTCFullYear(), next.getUTCMonth(), anchorDay)

  return { cycleStart, cycleEnd }
}

/**
 * Truncates a Date to midnight UTC on the same day.
 * Used to derive cycleAnchorDate from a subscription period start timestamp.
 */
export function toMidnightUTC(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

/**
 * Supplementary bulk reset — called from the Stripe `invoice.payment_succeeded`
 * webhook when billing_reason is 'subscription_cycle'.
 *
 * This is a convenience for monthly Stripe subscribers; the PRIMARY cycle logic
 * is the subscription-anchored check at redemption time in createRedemption().
 * This function is NOT required for correctness — the time-based entitlement
 * check handles all payment sources (Stripe, Apple IAP, Google Play, admin-grant).
 */
export async function resetVoucherCycleForUser(
  prisma: PrismaClient,
  userId: string
): Promise<void> {
  await prisma.userVoucherCycleState.updateMany({
    where: {
      userId,
      isRedeemedInCurrentCycle: true,
    },
    data: {
      isRedeemedInCurrentCycle: false,
      cycleStartDate: new Date(),
    },
  })
}
