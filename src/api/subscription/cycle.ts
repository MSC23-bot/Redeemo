import { PrismaClient } from '../../../generated/prisma/client'

function clampedDate(year: number, month: number, day: number): Date {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return new Date(Date.UTC(year, month, Math.min(day, lastDay)))
}

/**
 * Returns the start and end of the current voucher cycle for a given anchor date.
 * The cycle is subscription-anchored: it starts on the same day-of-month as
 * cycleAnchorDate, not tied to calendar months or Stripe billing periods.
 * Handles short months via day clamping (e.g. anchor day 31 → 28 in Feb).
 */
export function getCurrentCycleWindow(
  anchorDate: Date,
  now: Date = new Date()
): { cycleStart: Date; cycleEnd: Date } {
  const anchorDay = anchorDate.getUTCDate()

  let cycleStart = clampedDate(now.getUTCFullYear(), now.getUTCMonth(), anchorDay)

  if (now < cycleStart) {
    const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
    cycleStart = clampedDate(prev.getUTCFullYear(), prev.getUTCMonth(), anchorDay)
  }

  const next = new Date(Date.UTC(cycleStart.getUTCFullYear(), cycleStart.getUTCMonth() + 1, 1))
  const cycleEnd = clampedDate(next.getUTCFullYear(), next.getUTCMonth(), anchorDay)

  return { cycleStart, cycleEnd }
}

export function toMidnightUTC(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

/**
 * Resets the voucher redemption cycle for a user after their subscription renews.
 * Called from the Stripe `invoice.payment_succeeded` webhook when billing_reason
 * is 'subscription_cycle'. Only resets rows where the user has redeemed in the
 * current cycle — unaffected rows are left untouched.
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
