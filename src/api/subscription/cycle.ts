import { PrismaClient } from '../../../generated/prisma/client'

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
