import { describe, it, expect, vi } from 'vitest'
import { resetVoucherCycleForUser } from '../../../src/api/subscription/cycle'

describe('resetVoucherCycleForUser', () => {
  it('resets isRedeemedInCurrentCycle for all redeemed cycle states of the user', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 3 })
    const prisma = { userVoucherCycleState: { updateMany } } as any

    await resetVoucherCycleForUser(prisma, 'user-1')

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        isRedeemedInCurrentCycle: true,
      },
      data: {
        isRedeemedInCurrentCycle: false,
        cycleStartDate: expect.any(Date),
      },
    })
  })

  it('does nothing harmful if user has no redeemed cycle states', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 })
    const prisma = { userVoucherCycleState: { updateMany } } as any

    await resetVoucherCycleForUser(prisma, 'user-2')

    expect(updateMany).toHaveBeenCalledOnce()
  })
})
