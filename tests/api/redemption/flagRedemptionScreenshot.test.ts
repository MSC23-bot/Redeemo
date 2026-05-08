import { describe, it, expect, beforeEach, vi } from 'vitest'
import { flagRedemptionScreenshot } from '../../../src/api/redemption/service'

// Best-effort anti-fraud telemetry. Pure unit tests against fakes —
// the real Redis SETNX semantics are well documented; we just verify
// the service makes the right calls and respects the dedup return.

const fakePrisma = () => ({
  voucherRedemption:         { findUnique: vi.fn() },
  redemptionScreenshotEvent: { create:     vi.fn() },
})

const fakeRedis = () => ({
  // ioredis SET ... NX EX ... returns 'OK' on first set, null on duplicate.
  set: vi.fn(),
})

describe('flagRedemptionScreenshot', () => {
  let prisma: ReturnType<typeof fakePrisma>
  let redis:  ReturnType<typeof fakeRedis>

  beforeEach(() => {
    prisma = fakePrisma()
    redis  = fakeRedis()
    prisma.voucherRedemption.findUnique.mockResolvedValue({
      id:             'r1',
      userId:         'u1',
      redemptionCode: 'A7K2P9X4',
    })
  })

  it('writes RedemptionScreenshotEvent on first call within 5s window', async () => {
    redis.set.mockResolvedValue('OK')
    const result = await flagRedemptionScreenshot(
      prisma as any,
      redis  as any,
      'u1',
      'A7K2P9X4',
      'ios',
    )
    expect(result).toEqual({ accepted: true })
    expect(redis.set).toHaveBeenCalledWith(
      'rl:ss:u1:A7K2P9X4',
      '1',
      'EX',
      5,
      'NX',
    )
    expect(prisma.redemptionScreenshotEvent.create).toHaveBeenCalledWith({
      data: { userId: 'u1', redemptionId: 'r1', platform: 'ios' },
    })
  })

  it('returns accepted:false on dedup hit (Redis SETNX returns null)', async () => {
    redis.set.mockResolvedValue(null)
    const result = await flagRedemptionScreenshot(
      prisma as any,
      redis  as any,
      'u1',
      'A7K2P9X4',
      'ios',
    )
    expect(result).toEqual({ accepted: false })
    expect(prisma.redemptionScreenshotEvent.create).not.toHaveBeenCalled()
  })

  it('throws REDEMPTION_NOT_FOUND when the code does not exist', async () => {
    prisma.voucherRedemption.findUnique.mockResolvedValue(null)
    await expect(
      flagRedemptionScreenshot(prisma as any, redis as any, 'u1', 'NOPE0000', 'ios'),
    ).rejects.toThrow('REDEMPTION_NOT_FOUND')
    expect(redis.set).not.toHaveBeenCalled()
    expect(prisma.redemptionScreenshotEvent.create).not.toHaveBeenCalled()
  })

  it('throws REDEMPTION_NOT_FOUND when the redemption belongs to a different user', async () => {
    prisma.voucherRedemption.findUnique.mockResolvedValue({
      id:             'r1',
      userId:         'OTHER_USER',
      redemptionCode: 'A7K2P9X4',
    })
    await expect(
      flagRedemptionScreenshot(prisma as any, redis as any, 'u1', 'A7K2P9X4', 'ios'),
    ).rejects.toThrow('REDEMPTION_NOT_FOUND')
    expect(redis.set).not.toHaveBeenCalled()
    expect(prisma.redemptionScreenshotEvent.create).not.toHaveBeenCalled()
  })

  it('normalises code (lowercase + spaces + hyphens) to canonical uppercase before lookup + dedup', async () => {
    redis.set.mockResolvedValue('OK')
    await flagRedemptionScreenshot(
      prisma as any,
      redis  as any,
      'u1',
      'a7k2 p9x4',                              // user-supplied lowercase + space
      'android',
    )
    expect(prisma.voucherRedemption.findUnique).toHaveBeenCalledWith({
      where: { redemptionCode: 'A7K2P9X4' },
    })
    expect(redis.set).toHaveBeenCalledWith(
      'rl:ss:u1:A7K2P9X4',                      // dedup key uses normalised form
      '1',
      'EX',
      5,
      'NX',
    )
    expect(prisma.redemptionScreenshotEvent.create).toHaveBeenCalledWith({
      data: { userId: 'u1', redemptionId: 'r1', platform: 'android' },
    })
  })
})
