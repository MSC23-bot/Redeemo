import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AppError } from '../../../src/api/shared/errors'
import { flagRedemptionScreenshot } from '../../../src/api/redemption/screenshot-flag'

const mockPrisma = () => ({
  voucherRedemption: { findUnique: vi.fn() },
  redemptionScreenshotEvent: { findFirst: vi.fn(), create: vi.fn() },
} as any)

describe('flagRedemptionScreenshot', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 404-style error when redemption belongs to a different user', async () => {
    const prisma = mockPrisma()
    prisma.voucherRedemption.findUnique.mockResolvedValue({
      id: 'r1', userId: 'other-user', isValidated: false,
    })

    await expect(
      flagRedemptionScreenshot(prisma, 'user-1', 'CODE1', 'ios')
    ).rejects.toThrow('REDEMPTION_NOT_FOUND')
  })

  it('silently no-ops when redemption is already validated', async () => {
    const prisma = mockPrisma()
    prisma.voucherRedemption.findUnique.mockResolvedValue({
      id: 'r1', userId: 'user-1', isValidated: true,
    })

    const result = await flagRedemptionScreenshot(prisma, 'user-1', 'CODE1', 'ios')
    expect(result).toEqual({ logged: false })
    expect(prisma.redemptionScreenshotEvent.create).not.toHaveBeenCalled()
  })

  it('silently dedupes when a recent event exists within 5 seconds', async () => {
    const prisma = mockPrisma()
    prisma.voucherRedemption.findUnique.mockResolvedValue({
      id: 'r1', userId: 'user-1', isValidated: false,
    })
    prisma.redemptionScreenshotEvent.findFirst.mockResolvedValue({
      occurredAt: new Date(Date.now() - 2000),
    })

    const result = await flagRedemptionScreenshot(prisma, 'user-1', 'CODE1', 'ios')
    expect(result).toEqual({ logged: false })
    expect(prisma.redemptionScreenshotEvent.create).not.toHaveBeenCalled()
  })

  it('logs event otherwise', async () => {
    const prisma = mockPrisma()
    prisma.voucherRedemption.findUnique.mockResolvedValue({
      id: 'r1', userId: 'user-1', isValidated: false,
    })
    prisma.redemptionScreenshotEvent.findFirst.mockResolvedValue(null)
    prisma.redemptionScreenshotEvent.create.mockResolvedValue({ id: 'evt1' })

    const result = await flagRedemptionScreenshot(prisma, 'user-1', 'CODE1', 'ios')
    expect(result).toEqual({ logged: true })
    expect(prisma.redemptionScreenshotEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        redemptionId: 'r1',
        platform: 'ios',
      }),
    })
  })
})
